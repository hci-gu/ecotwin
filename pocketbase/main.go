package main

import (
	"app/lib/mapbox"
	utils "app/lib/utils"
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image/color"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	_ "app/migrations"

	"github.com/pocketbase/pocketbase"

	"github.com/disintegration/imaging"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func onLandcoverUpdate(record *core.Record, collection *core.Collection, app core.App) error {
	if record.GetString("color") == "" {
		return onLandcoverCreate(record, collection, app)
	}

	src, newFilePath := utils.GetImageForField(record, collection, app.DataDir(), "color", "color_100")

	resized := imaging.Resize(src, 100, 100, imaging.NearestNeighbor)
	newImage := imaging.New(resized.Bounds().Dx(), resized.Bounds().Dy(), color.NRGBA{})

	// Loop over each pixel of the image.
	bounds := newImage.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			originalColor := resized.At(x, y)
			closest := utils.ClosestColor(originalColor, utils.Palette)

			newImage.Set(x, y, closest)
		}
	}
	// set custom encodeOptions
	// encodeOpts := {
	// 	JPEGQuality: 100,
	// }
	if err := imaging.Save(newImage, newFilePath, imaging.PNGCompressionLevel(-1)); err != nil {
		return err
	}

	record.Set("color_100", utils.GetFileNameForPath(newFilePath))

	// Calculate color percentages
	jsonMap, _ := utils.CalculateColorPercentages(newImage, utils.Palette)
	record.Set("coverage", jsonMap)

	return nil
}

func onLandcoverCreate(record *core.Record, collection *core.Collection, app core.App) error {
	src, newFilePath := utils.GetImageForField(record, collection, app.DataDir(), "original", "color")

	newImage := imaging.New(src.Bounds().Dx(), src.Bounds().Dy(), color.NRGBA{})
	bounds := newImage.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			originalColor := src.At(x, y)
			closest := utils.ClosestColor(originalColor, utils.Palette)

			newImage.Set(x, y, closest)
		}
	}
	if err := imaging.Save(newImage, newFilePath); err != nil {
		return err
	}
	record.Set("color", strings.Split(newFilePath, "/")[len(strings.Split(newFilePath, "/"))-1])

	return onLandcoverUpdate(record, collection, app)
}

func onHeightmapCreate(record *core.Record, collection *core.Collection, app core.App) error {
	src, newFilePath := utils.GetImageForField(record, collection, app.DataDir(), "original", "heightmap")

	// init minheight and maxheight as infinity and -infinity
	minHeight := math.Inf(1)
	maxHeight := math.Inf(-1)

	newImage := imaging.New(src.Bounds().Dx(), src.Bounds().Dy(), color.NRGBA{})
	bounds := newImage.Bounds()
	// array of all heights
	heights := make([]float64, 0)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := src.At(x, y).RGBA()
			height := -10000 + float64(r*256*256+g*256+b)*0.1
			heights = append(heights, height)
			if height < minHeight {
				minHeight = height
			}
			if height > maxHeight {
				maxHeight = height
			}
		}
	}
	// normalize all heights
	for i, height := range heights {
		heights[i] = (height - minHeight) / (maxHeight - minHeight)
	}

	// set newImage to grayscale
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			height := heights[y*src.Bounds().Dx()+x]
			newImage.Set(x, y, color.NRGBA{
				R: uint8(height * 255),
				G: uint8(height * 255),
				B: uint8(height * 255),
				A: 255,
			})
		}
	}

	if err := imaging.Save(newImage, newFilePath); err != nil {
		return err
	}
	record.Set("heightmap", strings.Split(newFilePath, "/")[len(strings.Split(newFilePath, "/"))-1])
	record.Set("minHeight", minHeight)
	record.Set("maxHeight", maxHeight)

	return nil
}

type simulationUploadResponse struct {
	ID string `json:"id"`
}

type mockSimulationResponse struct {
	SimulationID  string   `json:"simulation_id"`
	WorldSize     int      `json:"world_size"`
	Species       []string `json:"species"`
	SampleEvery   int      `json:"sample_every"`
	IncludeFinal  bool     `json:"include_final"`
	DType         string   `json:"dtype"`
	Shape         []int    `json:"shape"`
	Steps         []int    `json:"steps"`
	Fitness       float64  `json:"fitness"`
	EpisodeLength int      `json:"episode_length"`
	EndReason     string   `json:"end_reason,omitempty"`
	BiomassB64    string   `json:"biomass_b64"`
}

type mockAgentSetSummary struct {
	Name    string   `json:"name"`
	Kind    string   `json:"kind"`
	Files   []string `json:"files"`
	Species []string `json:"species,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type normalizedActivityInput struct {
	ID                       string             `json:"id"`
	Name                     string             `json:"name"`
	Type                     string             `json:"type"`
	Timing                   string             `json:"timing,omitempty"`
	Start                    string             `json:"start,omitempty"`
	End                      string             `json:"end,omitempty"`
	TargetScope              string             `json:"targetScope"`
	Area                     any                `json:"area,omitempty"`
	AreaSummary              map[string]any     `json:"areaSummary,omitempty"`
	AffectedAreaKm2          float64            `json:"affectedAreaKm2,omitempty"`
	AffectedSpecies          []string           `json:"affectedSpecies,omitempty"`
	SpeciesEffortMultipliers map[string]float64 `json:"speciesEffortMultipliers,omitempty"`
	Construction             map[string]any     `json:"construction,omitempty"`
	Parameters               map[string]any     `json:"parameters,omitempty"`
}

type normalizedSimulationInput struct {
	Version     int                       `json:"version"`
	PlanID      string                    `json:"planId"`
	PlanName    string                    `json:"planName"`
	TileID      string                    `json:"tileId"`
	TileName    string                    `json:"tileName"`
	TileBBox    string                    `json:"tileBbox,omitempty"`
	TileAreaKm2 float64                   `json:"tileAreaKm2,omitempty"`
	Activities  []normalizedActivityInput `json:"activities"`
}

var simulationSpecies = []string{"sprat", "herring", "cod"}

var constructionCategorySet = map[string]bool{
	"offshorePlatform": true,
	"cableOrPipeline":  true,
	"harborWorks":      true,
	"dredging":         true,
}

var managementActivityTypeSet = map[string]bool{
	"fishing":      true,
	"construction": true,
	"windFarm":     true,
	"seaLane":      true,
	"trawlArea":    true,
}

const (
	tilePopulationJobsCollection = "tilePopulationJobs"

	tilePopulationKindLandcover = "landcover"
	tilePopulationKindOceanData = "oceanData"

	tilePopulationJobPending    = "pending"
	tilePopulationJobProcessing = "processing"
	tilePopulationJobSucceeded  = "succeeded"
	tilePopulationJobFailed     = "failed"
	tilePopulationJobSkipped    = "skipped"

	tileAssetStatusPending    = "pending"
	tileAssetStatusProcessing = "processing"
	tileAssetStatusReady      = "ready"
	tileAssetStatusFailed     = "failed"
	tileAssetStatusSkipped    = "skipped"

	mockSimulationMaxWorldSize = 24
	mockSimulationMaxSteps     = 300
)

func simulationMockEnabled() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv("SIMULATION_MOCK")))
	switch value {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func newMockSimulationID(seed string) string {
	if seed = strings.TrimSpace(seed); seed != "" {
		return fmt.Sprintf("mock-%s-%d", seed, time.Now().UnixNano())
	}
	return fmt.Sprintf("mock-%d", time.Now().UnixNano())
}

func queryInt(query url.Values, names []string, fallback int) int {
	for _, name := range names {
		raw := strings.TrimSpace(query.Get(name))
		if raw == "" {
			continue
		}
		if value, err := strconv.Atoi(raw); err == nil {
			return value
		}
	}
	return fallback
}

func queryBool(query url.Values, names []string, fallback bool) bool {
	for _, name := range names {
		raw := strings.TrimSpace(strings.ToLower(query.Get(name)))
		if raw == "" {
			continue
		}
		switch raw {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return fallback
}

func mockSimulationAgents() []mockAgentSetSummary {
	return []mockAgentSetSummary{
		{
			Name:    "mock-default",
			Kind:    "single",
			Files:   []string{"10_$cod_9079.34.npy.npz"},
			Species: []string{"cod"},
		},
		{
			Name: "mock-age3",
			Kind: "multi",
			Files: []string{
				"12_$sprat__a0_14568.62.npy.npz",
				"12_$sprat__a1_13210.11.npy.npz",
				"12_$sprat__a2_15100.44.npy.npz",
				"12_$herring__a0_12001.50.npy.npz",
				"12_$herring__a1_11888.20.npy.npz",
				"12_$herring__a2_12555.90.npy.npz",
				"12_$cod__a0_9800.25.npy.npz",
				"12_$cod__a1_10010.75.npy.npz",
				"12_$cod__a2_10333.40.npy.npz",
			},
			Species: []string{
				"sprat__a0", "sprat__a1", "sprat__a2",
				"herring__a0", "herring__a1", "herring__a2",
				"cod__a0", "cod__a1", "cod__a2",
			},
		},
		{
			Name:  "mock-empty",
			Kind:  "empty",
			Files: []string{},
		},
	}
}

func buildMockSimulationResponse(simulationID string, query url.Values) ([]byte, string, error) {
	worldSize := queryInt(query, []string{"worldSize", "world_size"}, 20)
	if worldSize < 4 {
		worldSize = 4
	}
	if worldSize > mockSimulationMaxWorldSize {
		worldSize = mockSimulationMaxWorldSize
	}

	maxSteps := queryInt(query, []string{"maxSteps", "max_steps"}, mockSimulationMaxSteps)
	if maxSteps < 1 {
		maxSteps = 1
	}
	if maxSteps > mockSimulationMaxSteps {
		maxSteps = mockSimulationMaxSteps
	}

	sampleEvery := queryInt(query, []string{"sampleEvery", "sample_every"}, 10)
	if sampleEvery < 1 {
		sampleEvery = 1
	}

	includeFinal := queryBool(query, []string{"includeFinal", "include_final"}, true)

	species := []string{"plankton", "sprat", "herring", "cod"}
	steps := make([]int, 0, maxSteps/sampleEvery+2)
	for step := 0; step <= maxSteps; step += sampleEvery {
		steps = append(steps, step)
	}
	if includeFinal && steps[len(steps)-1] != maxSteps {
		steps = append(steps, maxSteps)
	}
	if !includeFinal && len(steps) > 1 && steps[len(steps)-1] == maxSteps {
		steps = steps[:len(steps)-1]
	}
	if len(steps) == 0 {
		steps = append(steps, 0)
	}

	snapshotCount := len(steps)
	totalCells := snapshotCount * worldSize * worldSize * len(species)
	raw := make([]byte, totalCells*4)

	writeValue := func(offset int, value float32) {
		binary.LittleEndian.PutUint32(raw[offset:], math.Float32bits(value))
	}

	offset := 0
	for tIndex, step := range steps {
		progress := float64(step) / float64(maxSteps)
		for y := 0; y < worldSize; y++ {
			yRatio := float64(y) / float64(worldSize-1)
			for x := 0; x < worldSize; x++ {
				xRatio := float64(x) / float64(worldSize-1)
				spatial := 0.65 + 0.35*math.Sin((xRatio+yRatio+progress)*math.Pi)

				values := []float32{
					float32(65 + 18*math.Sin(progress*math.Pi*2) + 10*spatial),
					float32(32 + 10*math.Sin(progress*math.Pi*2+0.8) + 6*spatial),
					float32(28 + 8*math.Cos(progress*math.Pi*2+0.4) + 5*spatial),
					float32(18 + 6*math.Cos(progress*math.Pi*1.2) - 4*progress + 3*spatial),
				}

				for sp := range species {
					writeValue(offset, values[sp])
					offset += 4
				}
			}
		}
		_ = tIndex
	}

	response := mockSimulationResponse{
		SimulationID:  simulationID,
		WorldSize:     worldSize,
		Species:       species,
		SampleEvery:   sampleEvery,
		IncludeFinal:  includeFinal,
		DType:         "float32",
		Shape:         []int{snapshotCount, worldSize, worldSize, len(species)},
		Steps:         steps,
		Fitness:       float64(maxSteps) * 12.5,
		EpisodeLength: maxSteps,
		BiomassB64:    base64.StdEncoding.EncodeToString(raw),
	}

	body, err := json.Marshal(response)
	if err != nil {
		return nil, "", err
	}

	return body, "application/json", nil
}

func findOrCreateSimulationRecord(app core.App, simulationId string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("simulations")
	if err != nil {
		return nil, err
	}

	record, err := app.FindFirstRecordByData(collection, "simulationId", simulationId)
	if err == nil {
		return record, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	record = core.NewRecord(collection)
	record.Set("simulationId", simulationId)
	if err := app.Save(record); err != nil {
		return nil, err
	}

	return record, nil
}

func serveSimulationCachedFile(app core.App, re *core.RequestEvent, record *core.Record, filename string, contentType string) error {
	fsys, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fsys.Close()

	reader, err := fsys.GetReader(record.BaseFilesPath() + "/" + filename)
	if err != nil {
		return err
	}
	defer reader.Close()

	return re.Stream(http.StatusOK, contentType, reader)
}

func readRecordFileBytes(app core.App, record *core.Record, filename string) ([]byte, error) {
	if filename == "" {
		return nil, errors.New("missing filename")
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, err
	}
	defer fsys.Close()

	fileKey := record.BaseFilesPath() + "/" + filename
	reader, err := fsys.GetReader(fileKey)
	if err != nil {
		return nil, errors.New("failed to read file key: " + fileKey + ": " + err.Error())
	}
	defer reader.Close()

	return io.ReadAll(reader)
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func recordValueMap(record *core.Record, field string) map[string]any {
	value := record.Get(field)
	if value == nil {
		return map[string]any{}
	}

	raw, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return map[string]any{}
	}

	return decoded
}

func optionalMap(value any) map[string]any {
	if value == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil
	}
	return decoded
}

func parseFloatMap(value any) map[string]float64 {
	source := optionalMap(value)
	if source == nil {
		return nil
	}

	result := make(map[string]float64, len(source))
	for key, raw := range source {
		switch typed := raw.(type) {
		case float64:
			result[key] = typed
		case int:
			result[key] = float64(typed)
		case string:
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64); err == nil {
				result[key] = parsed
			}
		}
	}

	return result
}

func parseTileBBox(raw string) ([4]float64, bool) {
	trimmed := strings.TrimSpace(strings.Trim(raw, "[]"))
	if trimmed == "" {
		return [4]float64{}, false
	}

	parts := strings.Split(trimmed, ",")
	if len(parts) != 4 {
		return [4]float64{}, false
	}

	var bbox [4]float64
	for i, part := range parts {
		value, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			return [4]float64{}, false
		}
		bbox[i] = value
	}

	return bbox, true
}

func bboxAreaKm2(raw string) float64 {
	bbox, ok := parseTileBBox(raw)
	if !ok {
		return 0
	}

	const earthRadiusMeters = 6378137.0
	minLng := bbox[0] * math.Pi / 180
	minLat := bbox[1] * math.Pi / 180
	maxLng := bbox[2] * math.Pi / 180
	maxLat := bbox[3] * math.Pi / 180
	area := earthRadiusMeters * earthRadiusMeters * math.Abs(maxLng-minLng) * math.Abs(math.Sin(maxLat)-math.Sin(minLat))
	return area / 1_000_000
}

func numberFromMap(data map[string]any, key string) (float64, bool) {
	raw, ok := data[key]
	if !ok {
		return 0, false
	}
	switch value := raw.(type) {
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, false
		}
		return value, true
	case int:
		return float64(value), true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
}

func requireStringFromMap(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return strings.TrimSpace(value)
}

func buildNormalizedSimulationInput(app core.App, plan *core.Record, tile *core.Record) (*normalizedSimulationInput, error) {
	taskIds := plan.GetStringSlice("tasks")
	if len(taskIds) == 0 {
		return nil, errors.New("management plan has no activities")
	}

	tileArea := bboxAreaKm2(tile.GetString("bbox"))
	input := &normalizedSimulationInput{
		Version:     1,
		PlanID:      plan.Id,
		PlanName:    plan.GetString("name"),
		TileID:      tile.Id,
		TileName:    tile.GetString("name"),
		TileBBox:    tile.GetString("bbox"),
		TileAreaKm2: tileArea,
		Activities:  make([]normalizedActivityInput, 0, len(taskIds)),
	}

	for _, taskId := range taskIds {
		task, err := app.FindRecordById("tasks", taskId)
		if err != nil {
			return nil, fmt.Errorf("failed to load activity %s: %w", taskId, err)
		}

		taskType := task.GetString("type")
		if !managementActivityTypeSet[taskType] {
			return nil, fmt.Errorf("activity %q uses unsupported type %q", task.GetString("name"), taskType)
		}

		data := recordValueMap(task, "data")
		timing := requireStringFromMap(data, "timing")
		if timing == "" {
			if task.GetString("start") == "" && task.GetString("end") == "" {
				timing = "constant"
			} else {
				timing = "scheduled"
			}
		}
		if timing != "scheduled" && timing != "constant" {
			return nil, fmt.Errorf("activity %q has invalid timing %q", task.GetString("name"), timing)
		}
		if timing == "scheduled" && (task.GetString("start") == "" || task.GetString("end") == "") {
			return nil, fmt.Errorf("scheduled activity %q is missing start or end date", task.GetString("name"))
		}
		targetScope := requireStringFromMap(data, "targetScope")
		if targetScope != "wholeTile" && targetScope != "polygon" {
			return nil, fmt.Errorf("activity %q is missing targetScope", task.GetString("name"))
		}

		activity := normalizedActivityInput{
			ID:          task.Id,
			Name:        task.GetString("name"),
			Type:        taskType,
			Timing:      timing,
			Start:       task.GetString("start"),
			End:         task.GetString("end"),
			TargetScope: targetScope,
			Parameters:  map[string]any{},
		}

		if objective := requireStringFromMap(data, "objective"); objective != "" {
			activity.Parameters["objective"] = objective
		}
		if description := requireStringFromMap(data, "description"); description != "" {
			activity.Parameters["description"] = description
		}
		if cost, ok := numberFromMap(data, "cost"); ok {
			activity.Parameters["cost"] = cost
		}
		if revenue, ok := numberFromMap(data, "revenue"); ok {
			activity.Parameters["revenue"] = revenue
		}

		if targetScope == "polygon" {
			area := data["area"]
			if area == nil {
				return nil, fmt.Errorf("activity %q is missing polygon area", task.GetString("name"))
			}
			activity.Area = area
			activity.AreaSummary = optionalMap(data["areaSummary"])
			if areaKm2, ok := numberFromMap(activity.AreaSummary, "areaKm2"); ok {
				activity.AffectedAreaKm2 = areaKm2
			}
		} else {
			activity.AffectedAreaKm2 = tileArea
		}

		switch taskType {
		case "fishing":
			multipliers := parseFloatMap(data["speciesEffortMultipliers"])
			if len(multipliers) == 0 {
				return nil, fmt.Errorf("fishing activity %q is missing species effort multipliers", task.GetString("name"))
			}
			for _, species := range simulationSpecies {
				value, ok := multipliers[species]
				if !ok || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
					return nil, fmt.Errorf("fishing activity %q has invalid effort multiplier for %s", task.GetString("name"), species)
				}
				activity.AffectedSpecies = append(activity.AffectedSpecies, species)
			}
			activity.SpeciesEffortMultipliers = multipliers
		case "construction":
			construction := optionalMap(data["construction"])
			category := requireStringFromMap(construction, "category")
			intensity, ok := numberFromMap(construction, "intensity")
			if !constructionCategorySet[category] {
				return nil, fmt.Errorf("construction activity %q has invalid category", task.GetString("name"))
			}
			if !ok || intensity < 0 {
				return nil, fmt.Errorf("construction activity %q has invalid intensity", task.GetString("name"))
			}
			activity.Construction = construction
		}

		input.Activities = append(input.Activities, activity)
	}

	return input, nil
}

func mergeSimulationOptions(options any, input *normalizedSimulationInput) ([]byte, error) {
	merged := map[string]any{}
	if options != nil {
		raw, err := json.Marshal(options)
		if err == nil {
			_ = json.Unmarshal(raw, &merged)
		}
	}
	if merged == nil {
		merged = map[string]any{}
	}

	merged["managementPlan"] = input
	return json.Marshal(merged)
}

func ensureTilePopulationJob(app core.App, tileId string, kind string) error {
	collection, err := app.FindCollectionByNameOrId(tilePopulationJobsCollection)
	if err != nil {
		return err
	}

	existing, err := app.FindFirstRecordByFilter(
		tilePopulationJobsCollection,
		`tile = {:tileId} && kind = {:kind}`,
		dbx.Params{
			"tileId": tileId,
			"kind":   kind,
		},
	)
	if err == nil {
		if existing.GetString("status") == "" {
			existing.Set("status", tilePopulationJobPending)
			return app.Save(existing)
		}

		return nil
	}

	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	job := core.NewRecord(collection)
	job.Set("tile", tileId)
	job.Set("kind", kind)
	job.Set("status", tilePopulationJobPending)
	job.Set("attemptCount", 0)

	return app.Save(job)
}

func enqueueTilePopulation(app core.App, tile *core.Record) error {
	tile.Set("landcoverStatus", tileAssetStatusPending)
	tile.Set("oceanDataStatus", "")
	if err := app.Save(tile); err != nil {
		return err
	}

	return ensureTilePopulationJob(app, tile.Id, tilePopulationKindLandcover)
}

func uploadSimulationMap(
	ctx *core.RequestEvent,
	httpClient *http.Client,
	targetURL *url.URL,
	texture []byte,
	depth []byte,
	optionsJSON []byte,
	query string,
) ([]byte, int, string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	if err := writer.WriteField("options", string(optionsJSON)); err != nil {
		return nil, 0, "", err
	}

	texturePart, err := writer.CreateFormFile("texture", "map.png")
	if err != nil {
		return nil, 0, "", err
	}
	if _, err := texturePart.Write(texture); err != nil {
		return nil, 0, "", err
	}

	depthPart, err := writer.CreateFormFile("depth", "depth.png")
	if err != nil {
		return nil, 0, "", err
	}
	if _, err := depthPart.Write(depth); err != nil {
		return nil, 0, "", err
	}

	if err := writer.Close(); err != nil {
		return nil, 0, "", err
	}

	upURL := *targetURL
	upURL.Path = "/simulate/upload"
	upURL.RawQuery = query

	req, err := http.NewRequestWithContext(ctx.Request.Context(), http.MethodPost, upURL.String(), &buf)
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	req.Header.Del("Accept-Encoding")
	req.Host = targetURL.Host

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	return body, resp.StatusCode, contentType, nil
}

func handleSimulateRunAndCache(
	app core.App,
	httpClient *http.Client,
	targetURL *url.URL,
	re *core.RequestEvent,
	simulationId string,
) error {
	if simulationId == "" {
		return re.BadRequestError("Missing simulation id.", nil)
	}

	format := strings.ToLower(re.Request.URL.Query().Get("format"))
	if format == "" {
		format = "base64"
	}

	var (
		fieldName   string
		contentType string
		ext         string
	)

	switch format {
	case "base64":
		fieldName = "resultJson"
		contentType = "application/json"
		ext = "json"
	case "npz":
		fieldName = "resultNpz"
		contentType = "application/octet-stream"
		ext = "npz"
	default:
		return re.BadRequestError("Invalid format (expects base64 or npz).", nil)
	}

	// serve cached response if available
	if simCollection, err := app.FindCollectionByNameOrId("simulations"); err == nil {
		if record, err := app.FindFirstRecordByData(simCollection, "simulationId", simulationId); err == nil {
			if filename := record.GetString(fieldName); filename != "" {
				if err := serveSimulationCachedFile(app, re, record, filename, contentType); err == nil {
					return nil
				}
			}
		}
	}

	if simulationMockEnabled() {
		if format != "base64" {
			return re.BadRequestError("Mock simulation supports only format=base64.", nil)
		}

		body, mockContentType, err := buildMockSimulationResponse(simulationId, re.Request.URL.Query())
		if err != nil {
			return re.InternalServerError("Failed to generate mock simulation response.", err)
		}

		if record, err := findOrCreateSimulationRecord(app, simulationId); err == nil {
			if file, fileErr := filesystem.NewFileFromBytes(body, "simulation_result.json"); fileErr == nil {
				record.Set(fieldName, file)
				if saveErr := app.Save(record); saveErr != nil {
					log.Printf("simulate/mock: failed to save cached result for %q: %v", simulationId, saveErr)
				}
			}
		}

		return re.Blob(http.StatusOK, mockContentType, body)
	}

	// otherwise proxy to upstream and cache the response
	upURL := *targetURL
	upURL.Path = "/simulate/" + simulationId
	upURL.RawQuery = re.Request.URL.RawQuery

	upReq, err := http.NewRequestWithContext(re.Request.Context(), http.MethodGet, upURL.String(), nil)
	if err != nil {
		return re.InternalServerError("Failed to build upstream request.", err)
	}
	upReq.Header = re.Request.Header.Clone()
	upReq.Header.Del("Accept-Encoding") // let net/http handle decompression
	upReq.Host = targetURL.Host

	resp, err := httpClient.Do(upReq)
	if err != nil {
		return re.InternalServerError("Failed to contact simulation upstream.", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return re.InternalServerError("Failed to read simulation upstream response.", err)
	}

	if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
		record, err := findOrCreateSimulationRecord(app, simulationId)
		if err != nil {
			log.Printf("simulate/run: failed to find or create simulations record for %q: %v", simulationId, err)
		} else {
			file, err := filesystem.NewFileFromBytes(body, "simulation_result."+ext)
			if err != nil {
				log.Printf("simulate/run: failed to create result file for %q: %v", simulationId, err)
			} else {
				record.Set(fieldName, file)
				if err := app.Save(record); err != nil {
					log.Printf("simulate/run: failed to save cached result for %q: %v", simulationId, err)
				}
			}
		}
	}

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		contentType = ct
	}

	return re.Blob(resp.StatusCode, contentType, body)
}

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnRecordCreateRequest("tiles").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		x := e.Record.GetInt("x")
		y := e.Record.GetInt("y")
		zoom := e.Record.GetInt("zoom")
		image := mapbox.DownloadSatelliteTile(x, y, zoom)

		filePath := utils.GetFilePathForField(e.Record, e.Collection, app.DataDir(), "satellite")
		if err := imaging.Save(image, filePath); err != nil {
			return err
		}
		e.Record.Set("satellite", utils.GetFileNameForPath(filePath))

		bboxString := e.Record.GetString("bbox")
		metersPerPixel := mapbox.MeterPerPixelFromBboxAndZoom(zoom, bboxString)
		e.Record.Set("metersPerPixel", metersPerPixel)

		if err := app.Save(e.Record); err != nil {
			return err
		}

		image = mapbox.DownloadHeightmapTile(x, y, zoom)

		collection, err := app.FindCollectionByNameOrId("heightmaps")
		if err != nil {
			return err
		}

		heightmap := core.NewRecord(collection)
		if err := app.Save(heightmap); err != nil {
			return err
		}

		filePath = utils.GetFilePathForField(heightmap, collection, app.DataDir(), "original")
		if err := imaging.Save(image, filePath); err != nil {
			return err
		}
		heightmap.Set("original", utils.GetFileNameForPath(filePath))
		if err := app.Save(heightmap); err != nil {
			return err
		}

		e.Record.Set("heightmap", heightmap.Id)
		if err := app.Save(e.Record); err != nil {
			return err
		}

		if err := onHeightmapCreate(heightmap, collection, app); err != nil {
			return err
		}

		if err := app.Save(heightmap); err != nil {
			return err
		}

		return enqueueTilePopulation(app, e.Record)
	})

	app.OnRecordCreateRequest("landcovers").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		if err := onLandcoverCreate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return app.Save(e.Record)
	})

	app.OnRecordUpdateRequest("landcovers").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		if err := onLandcoverUpdate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return app.Save(e.Record)
	})

	app.OnRecordCreateRequest("heightmaps").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}

		if err := onHeightmapCreate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return app.Save(e.Record)
	})

	// Set up reverse proxy
	targetURL, err := url.Parse("http://localhost:4000")
	if err != nil {
		log.Fatal("Invalid target URL")
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	proxy.ModifyResponse = func(resp *http.Response) error {
		// Remove existing CORS header to avoid duplicates
		resp.Header.Del("Access-Control-Allow-Origin")
		return nil
	}

	httpClient := &http.Client{Timeout: 10 * time.Minute}

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.BindFunc(func(re *core.RequestEvent) error {
			if re.Request.Method == http.MethodOptions {
				re.Response.WriteHeader(http.StatusOK)
				return nil
			}

			err := re.Next()
			log.Printf("Response status: %d", re.Status())
			return err
		})

		// Client-friendly endpoint that:
		// - resolves the simulation -> tile -> required files
		// - uploads them to the upstream to get a runner simulation_id
		// - stores it in simulations.simulationId
		// - runs the simulation and forwards the response (also cached via file fields)
		e.Router.GET("/simulation/{id}/run", func(re *core.RequestEvent) error {
			simRecordId := re.Request.PathValue("id")
			if simRecordId == "" {
				return re.BadRequestError("Missing simulation record id.", nil)
			}

			simulation, err := app.FindRecordById("simulations", simRecordId)
			if err != nil {
				return re.NotFoundError("Simulation record not found.", err)
			}

			planRel := simulation.GetString("plan")
			if planRel == "" {
				return re.BadRequestError("Simulation is missing plan relation.", nil)
			}

			plan, err := app.FindRecordById("managementPlans", planRel)
			if err != nil {
				return re.InternalServerError("Failed to load management plan for simulation.", err)
			}

			tileRel := plan.GetString("tile")
			if tileRel == "" {
				return re.BadRequestError("Management plan is missing tile relation.", nil)
			}

			tile, err := app.FindRecordById("tiles", tileRel)
			if err != nil {
				return re.InternalServerError("Failed to load tile for management plan.", err)
			}

			landcoverRel := tile.GetString("landcover")
			if landcoverRel == "" {
				return re.BadRequestError("Tile is missing landcover relation.", nil)
			}
			landcover, err := app.FindRecordById("landcovers", landcoverRel)
			if err != nil {
				return re.InternalServerError("Failed to load landcover record.", err)
			}
			textureName := firstNonEmptyString(
				landcover.GetString("color_100"),
			)
			if textureName == "" {
				return re.BadRequestError("landcover is missing texture file.", nil)
			}

			oceanRel := tile.GetString("oceanData")
			if oceanRel == "" {
				return re.BadRequestError("Tile is missing oceanData relation (depth).", nil)
			}

			ocean, err := app.FindRecordById("oceanData", oceanRel)
			if err != nil {
				return re.InternalServerError("Failed to load oceanData record.", err)
			}

			depthName := ocean.GetString("depth")
			if depthName == "" {
				return re.BadRequestError("oceanData is missing depth file.", nil)
			}

			textureBytes, err := readRecordFileBytes(app, landcover, textureName)
			if err != nil {
				return re.InternalServerError("Failed to read landcover texture file.", err)
			}

			depthBytes, err := readRecordFileBytes(app, ocean, depthName)
			if err != nil {
				return re.InternalServerError("Failed to read ocean depth file.", err)
			}

			normalizedInput, err := buildNormalizedSimulationInput(app, plan, tile)
			if err != nil {
				return re.BadRequestError("Management plan cannot be normalized for simulation: "+err.Error(), err)
			}

			optionsJSON, err := mergeSimulationOptions(simulation.Get("options"), normalizedInput)
			if err != nil {
				return re.InternalServerError("Failed to encode simulation input.", err)
			}

			simulation.Set("inputJson", normalizedInput)
			simulation.Set("status", "running")
			simulation.Set("resultJson", "")
			simulation.Set("resultNpz", "")
			if err := app.Save(simulation); err != nil {
				return re.InternalServerError("Failed to store normalized simulation input.", err)
			}

			if simulationMockEnabled() {
				simulationID := newMockSimulationID(simRecordId)
				simulation.Set("simulationId", simulationID)
				if err := app.Save(simulation); err != nil {
					return re.InternalServerError("Failed to update simulation record with mock simulationId.", err)
				}

				if err := handleSimulateRunAndCache(app, httpClient, targetURL, re, simulationID); err != nil {
					simulation.Set("status", "failed")
					_ = app.Save(simulation)
					return err
				}
				simulation.Set("status", "completed")
				return app.Save(simulation)
			}

			uploadBody, uploadStatus, uploadContentType, err := uploadSimulationMap(
				re,
				httpClient,
				targetURL,
				textureBytes,
				depthBytes,
				optionsJSON,
				re.Request.URL.RawQuery,
			)
			if err != nil {
				simulation.Set("status", "failed")
				_ = app.Save(simulation)
				return re.InternalServerError("Failed to upload map to simulation upstream.", err)
			}
			if uploadStatus < 200 || uploadStatus > 299 {
				simulation.Set("status", "failed")
				_ = app.Save(simulation)
				return re.Blob(uploadStatus, uploadContentType, uploadBody)
			}

			var parsed simulationUploadResponse
			if err := json.Unmarshal(uploadBody, &parsed); err != nil || parsed.ID == "" {
				simulation.Set("status", "failed")
				_ = app.Save(simulation)
				return re.InternalServerError("Invalid simulation upstream upload response.", err)
			}

			// Store the upstream simulation_id; result files were cleared with the input snapshot.
			simulation.Set("simulationId", parsed.ID)
			if err := app.Save(simulation); err != nil {
				return re.InternalServerError("Failed to update simulation record with simulationId.", err)
			}

			if err := handleSimulateRunAndCache(app, httpClient, targetURL, re, parsed.ID); err != nil {
				simulation.Set("status", "failed")
				_ = app.Save(simulation)
				return err
			}
			simulation.Set("status", "completed")
			return app.Save(simulation)
		})

		e.Router.POST("/simulate/upload", func(re *core.RequestEvent) error {
			if simulationMockEnabled() {
				body, err := json.Marshal(simulationUploadResponse{
					ID: newMockSimulationID("upload"),
				})
				if err != nil {
					return re.InternalServerError("Failed to build mock upload response.", err)
				}
				return re.Blob(http.StatusOK, "application/json", body)
			}

			upURL := *targetURL
			upURL.Path = "/simulate/upload"
			upURL.RawQuery = re.Request.URL.RawQuery

			upReq, err := http.NewRequestWithContext(re.Request.Context(), http.MethodPost, upURL.String(), re.Request.Body)
			if err != nil {
				return re.InternalServerError("Failed to build upstream request.", err)
			}
			upReq.Header = re.Request.Header.Clone()
			upReq.Header.Del("Accept-Encoding") // let net/http handle decompression
			upReq.Host = targetURL.Host

			resp, err := httpClient.Do(upReq)
			if err != nil {
				return re.InternalServerError("Failed to contact simulation upstream.", err)
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return re.InternalServerError("Failed to read simulation upstream response.", err)
			}

			// best-effort: ensure a simulations record exists
			if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
				var parsed simulationUploadResponse
				if err := json.Unmarshal(body, &parsed); err == nil && parsed.ID != "" {
					if _, err := findOrCreateSimulationRecord(app, parsed.ID); err != nil {
						log.Printf("simulate/upload: failed to upsert simulations record for %q: %v", parsed.ID, err)
					}
				}
			}

			contentType := resp.Header.Get("Content-Type")
			if contentType == "" {
				contentType = "application/json"
			}

			return re.Blob(resp.StatusCode, contentType, body)
		})

		e.Router.GET("/simulate/agents", func(re *core.RequestEvent) error {
			if simulationMockEnabled() {
				body, err := json.Marshal(mockSimulationAgents())
				if err != nil {
					return re.InternalServerError("Failed to build mock agents response.", err)
				}
				return re.Blob(http.StatusOK, "application/json", body)
			}

			proxy.ServeHTTP(re.Response, re.Request)
			return nil
		})

		e.Router.GET("/simulate/{simulationId}", func(re *core.RequestEvent) error {
			return handleSimulateRunAndCache(app, httpClient, targetURL, re, re.Request.PathValue("simulationId"))
		})

		// proxy all other /simulate/* GET routes
		e.Router.GET("/simulate/{path...}", func(re *core.RequestEvent) error {
			proxy.ServeHTTP(re.Response, re.Request)
			return nil
		})

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
