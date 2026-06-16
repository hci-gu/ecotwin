package main

import (
	"app/lib/mapbox"
	utils "app/lib/utils"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
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

func pngFileFromImage(img image.Image, name string) (*filesystem.File, error) {
	if img == nil {
		return nil, fmt.Errorf("cannot create %s from an empty image", name)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return filesystem.NewFileFromBytes(buf.Bytes(), name)
}

func imageForRecordField(record *core.Record, collection *core.Collection, app core.App, field string) (image.Image, error) {
	if files := record.GetUnsavedFiles(field); len(files) > 0 {
		reader, err := files[0].Reader.Open()
		if err != nil {
			return nil, err
		}
		defer reader.Close()

		img, _, err := image.Decode(reader)
		return img, err
	}

	src, _ := utils.GetImageForField(record, collection, app.DataDir(), field, field+"_generated")
	return src, nil
}

func onLandcoverUpdate(record *core.Record, collection *core.Collection, app core.App) error {
	if record.GetString("color") == "" && len(record.GetUnsavedFiles("color")) == 0 {
		return onLandcoverCreate(record, collection, app)
	}

	src, err := imageForRecordField(record, collection, app, "color")
	if err != nil {
		return err
	}

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
	file, err := pngFileFromImage(newImage, "color_100.png")
	if err != nil {
		return err
	}
	record.Set("color_100", file)

	// Calculate color percentages
	jsonMap, _ := utils.CalculateColorPercentages(newImage, utils.Palette)
	record.Set("coverage", jsonMap)

	return nil
}

func onLandcoverCreate(record *core.Record, collection *core.Collection, app core.App) error {
	if record.GetString("original") == "" && len(record.GetUnsavedFiles("original")) == 0 {
		return nil
	}

	src, err := imageForRecordField(record, collection, app, "original")
	if err != nil {
		return err
	}

	newImage := imaging.New(src.Bounds().Dx(), src.Bounds().Dy(), color.NRGBA{})
	bounds := newImage.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			originalColor := src.At(x, y)
			closest := utils.ClosestColor(originalColor, utils.Palette)

			newImage.Set(x, y, closest)
		}
	}
	file, err := pngFileFromImage(newImage, "color.png")
	if err != nil {
		return err
	}
	record.Set("color", file)

	return onLandcoverUpdate(record, collection, app)
}

func onHeightmapCreate(record *core.Record, collection *core.Collection, app core.App) error {
	if record.GetString("original") == "" && len(record.GetUnsavedFiles("original")) == 0 {
		return nil
	}

	src, err := imageForRecordField(record, collection, app, "original")
	if err != nil {
		return err
	}

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

	file, err := pngFileFromImage(newImage, "heightmap.png")
	if err != nil {
		return err
	}
	record.Set("heightmap", file)
	record.Set("minHeight", minHeight)
	record.Set("maxHeight", maxHeight)

	return nil
}

type simAgentSummary struct {
	Name    string   `json:"name"`
	Kind    string   `json:"kind"`
	Files   []string `json:"files"`
	Species []string `json:"species,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type inferenceModelSummary struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Kind              string   `json:"kind"`
	Species           []string `json:"species"`
	SupportsAgeGroups bool     `json:"supports_age_groups,omitempty"`
	Files             []string `json:"files,omitempty"`
	Description       string   `json:"description,omitempty"`
	Version           string   `json:"version,omitempty"`
}

type inferenceRunEnvelope struct {
	RunID  string         `json:"run_id"`
	Status string         `json:"status"`
	Result map[string]any `json:"result,omitempty"`
	Error  map[string]any `json:"error,omitempty"`
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
	Areas                    []map[string]any   `json:"areas,omitempty"`
	AffectedAreaKm2          float64            `json:"affectedAreaKm2,omitempty"`
	AffectedSpecies          []string           `json:"affectedSpecies,omitempty"`
	SpeciesEffortMultipliers map[string]float64 `json:"speciesEffortMultipliers,omitempty"`
	Construction             map[string]any     `json:"construction,omitempty"`
	Parameters               map[string]any     `json:"parameters,omitempty"`
}

type normalizedSimulationInput struct {
	Version          int                       `json:"version"`
	PlanID           string                    `json:"planId"`
	PlanName         string                    `json:"planName"`
	PlanStart        string                    `json:"planStart,omitempty"`
	PlanEnd          string                    `json:"planEnd,omitempty"`
	DurationDays     int                       `json:"durationDays,omitempty"`
	TickDurationDays int                       `json:"tickDurationDays"`
	SimulationTicks  int                       `json:"simulationTicks"`
	SampleEvery      int                       `json:"sampleEvery"`
	TileID           string                    `json:"tileId"`
	TileName         string                    `json:"tileName"`
	TileBBox         string                    `json:"tileBbox,omitempty"`
	TileAreaKm2      float64                   `json:"tileAreaKm2,omitempty"`
	Activities       []normalizedActivityInput `json:"activities"`
}

var simulationSpecies = []string{
	"phytoplankton",
	"zooplankton",
	"pelagicFish",
	"codfish",
	"porpoises",
	"seabirds",
}

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

	defaultSimulationTicks      = 300
	defaultSimulationTickDays   = 1
	maxSimulationPlaybackFrames = 96
)

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

func markSimulationFailed(app core.App, simulation *core.Record) {
	if simulation == nil {
		return
	}
	simulation.Set("status", "failed")
	if err := app.Save(simulation); err != nil {
		log.Printf("simulation/run: failed to mark simulation %q failed: %v", simulation.Id, err)
	}
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

func optionalMapSlice(value any) []map[string]any {
	if value == nil {
		return nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var decoded []map[string]any
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

func numericValue(raw any) (float64, bool) {
	switch value := raw.(type) {
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, false
		}
		return value, true
	case int:
		return float64(value), true
	case json.Number:
		parsed, err := value.Float64()
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
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

func normalizedActivityImpact(activity normalizedActivityInput) float64 {
	if activity.Parameters == nil {
		return 1
	}
	value, ok := numberFromMap(activity.Parameters, "impact")
	if !ok {
		return 1
	}
	if value < 0 {
		return 0
	}
	if value > 5 {
		value = 5
	}
	return value / 5
}

func polygonRingsFromGeoJSON(value any) [][][2]float64 {
	geometry := optionalMap(value)
	if geometry == nil {
		return nil
	}
	if requireStringFromMap(geometry, "type") != "Polygon" {
		return nil
	}

	rawCoordinates, ok := geometry["coordinates"].([]any)
	if !ok || len(rawCoordinates) == 0 {
		return nil
	}

	rings := make([][][2]float64, 0, len(rawCoordinates))
	for _, rawRing := range rawCoordinates {
		points, ok := rawRing.([]any)
		if !ok || len(points) < 4 {
			continue
		}

		ring := make([][2]float64, 0, len(points))
		for _, rawPoint := range points {
			point, ok := rawPoint.([]any)
			if !ok || len(point) < 2 {
				continue
			}
			lng, okLng := numericValue(point[0])
			lat, okLat := numericValue(point[1])
			if !okLng || !okLat {
				continue
			}
			ring = append(ring, [2]float64{lng, lat})
		}
		if len(ring) >= 4 {
			rings = append(rings, ring)
		}
	}
	return rings
}

func activityAreaGeometries(activity normalizedActivityInput) []any {
	areas := make([]any, 0, len(activity.Areas)+1)
	for _, entry := range activity.Areas {
		if area := entry["area"]; area != nil {
			areas = append(areas, area)
		}
	}
	if len(areas) == 0 && activity.Area != nil {
		areas = append(areas, activity.Area)
	}
	return areas
}

func pointInRing(lng float64, lat float64, ring [][2]float64) bool {
	inside := false
	j := len(ring) - 1
	for i := range ring {
		xi, yi := ring[i][0], ring[i][1]
		xj, yj := ring[j][0], ring[j][1]
		denominator := yj - yi
		if math.Abs(denominator) > 1e-12 {
			intersects := ((yi > lat) != (yj > lat)) &&
				(lng < (xj-xi)*(lat-yi)/denominator+xi)
			if intersects {
				inside = !inside
			}
		}
		j = i
	}
	return inside
}

func pointInPolygon(lng float64, lat float64, rings [][][2]float64) bool {
	if len(rings) == 0 || !pointInRing(lng, lat, rings[0]) {
		return false
	}
	for _, hole := range rings[1:] {
		if pointInRing(lng, lat, hole) {
			return false
		}
	}
	return true
}

func encodeGrayPNG(img *image.Gray) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func impactNoisePNGForInference(input *normalizedSimulationInput, width int, height int) ([]byte, error) {
	if input == nil || width <= 0 || height <= 0 {
		return nil, errors.New("impact noise raster requires simulation input and positive dimensions")
	}
	bbox, ok := parseTileBBox(input.TileBBox)
	if !ok {
		return nil, errors.New("impact noise raster requires tile bbox")
	}

	impact := image.NewGray(image.Rect(0, 0, width, height))
	for _, activity := range input.Activities {
		if activity.Type != "windFarm" && activity.Type != "seaLane" {
			continue
		}

		value := uint8(math.Round(normalizedActivityImpact(activity) * 255))
		if value == 0 {
			continue
		}

		for _, area := range activityAreaGeometries(activity) {
			rings := polygonRingsFromGeoJSON(area)
			if len(rings) == 0 {
				continue
			}

			for y := 0; y < height; y++ {
				lat := bbox[3] - ((float64(y)+0.5)/float64(height))*(bbox[3]-bbox[1])
				for x := 0; x < width; x++ {
					lng := bbox[0] + ((float64(x)+0.5)/float64(width))*(bbox[2]-bbox[0])
					if !pointInPolygon(lng, lat, rings) {
						continue
					}
					offset := y*impact.Stride + x
					if value > impact.Pix[offset] {
						impact.Pix[offset] = value
					}
				}
			}
		}
	}

	blurred := imaging.Blur(impact, 2.2)
	normalized := image.NewGray(blurred.Bounds())
	for y := normalized.Bounds().Min.Y; y < normalized.Bounds().Max.Y; y++ {
		for x := normalized.Bounds().Min.X; x < normalized.Bounds().Max.X; x++ {
			normalized.SetGray(x, y, color.GrayModel.Convert(blurred.At(x, y)).(color.Gray))
		}
	}
	return encodeGrayPNG(normalized)
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

func parsePlanDate(value string) (time.Time, bool) {
	datePart := strings.TrimSpace(value)
	if len(datePart) >= 10 {
		datePart = datePart[:10]
	}
	if datePart == "" {
		return time.Time{}, false
	}

	parsed, err := time.Parse("2006-01-02", datePart)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func daysBetween(start time.Time, end time.Time) int {
	days := int(math.Round(end.Sub(start).Hours() / 24))
	if days < 0 {
		return 0
	}
	return days
}

func sampleEveryForSimulationTicks(ticks int) int {
	if ticks <= 0 {
		return 1
	}
	sampleEvery := int(math.Ceil(float64(ticks) / float64(maxSimulationPlaybackFrames)))
	if sampleEvery < 1 {
		return 1
	}
	return sampleEvery
}

func applySimulationTimelineDefaults(rawQuery string, input *normalizedSimulationInput) string {
	query, err := url.ParseQuery(rawQuery)
	if err != nil {
		query = url.Values{}
	}

	if input == nil || input.SimulationTicks <= 0 {
		return query.Encode()
	}

	effectiveTicks := input.SimulationTicks
	if rawTicks := firstNonEmptyString(query.Get("maxSteps"), query.Get("max_steps")); rawTicks != "" {
		if parsed, err := strconv.Atoi(strings.TrimSpace(rawTicks)); err == nil && parsed > 0 {
			effectiveTicks = parsed
		}
	}

	if query.Get("maxSteps") == "" && query.Get("max_steps") == "" {
		query.Set("maxSteps", strconv.Itoa(input.SimulationTicks))
	}
	if query.Get("sampleEvery") == "" && query.Get("sample_every") == "" {
		query.Set("sampleEvery", strconv.Itoa(sampleEveryForSimulationTicks(effectiveTicks)))
	}
	if query.Get("tickDurationDays") == "" && query.Get("tick_duration_days") == "" {
		query.Set("tickDurationDays", strconv.Itoa(input.TickDurationDays))
	}
	if input.PlanStart != "" && query.Get("startDate") == "" && query.Get("start_date") == "" {
		query.Set("startDate", input.PlanStart)
	}
	if input.PlanEnd != "" && query.Get("endDate") == "" && query.Get("end_date") == "" {
		query.Set("endDate", input.PlanEnd)
	}

	return query.Encode()
}

func buildNormalizedSimulationInput(app core.App, plan *core.Record, tile *core.Record) (*normalizedSimulationInput, error) {
	taskIds := plan.GetStringSlice("tasks")
	if len(taskIds) == 0 {
		return nil, errors.New("management plan has no activities")
	}

	tileArea := bboxAreaKm2(tile.GetString("bbox"))
	input := &normalizedSimulationInput{
		Version:          2,
		PlanID:           plan.Id,
		PlanName:         plan.GetString("name"),
		TickDurationDays: defaultSimulationTickDays,
		SimulationTicks:  defaultSimulationTicks,
		SampleEvery:      sampleEveryForSimulationTicks(defaultSimulationTicks),
		TileID:           tile.Id,
		TileName:         tile.GetString("name"),
		TileBBox:         tile.GetString("bbox"),
		TileAreaKm2:      tileArea,
		Activities:       make([]normalizedActivityInput, 0, len(taskIds)),
	}
	var planStart time.Time
	var planEnd time.Time
	hasPlanRange := false

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
		if timing == "scheduled" {
			start, ok := parsePlanDate(task.GetString("start"))
			if !ok {
				return nil, fmt.Errorf("scheduled activity %q has invalid start date", task.GetString("name"))
			}
			end, ok := parsePlanDate(task.GetString("end"))
			if !ok {
				return nil, fmt.Errorf("scheduled activity %q has invalid end date", task.GetString("name"))
			}
			if end.Before(start) {
				return nil, fmt.Errorf("scheduled activity %q ends before it starts", task.GetString("name"))
			}
			if !hasPlanRange || start.Before(planStart) {
				planStart = start
			}
			if !hasPlanRange || end.After(planEnd) {
				planEnd = end
			}
			hasPlanRange = true
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
			areaEntries := optionalMapSlice(data["areas"])
			if len(areaEntries) > 0 {
				activity.Areas = make([]map[string]any, 0, len(areaEntries))
				var totalAreaKm2 float64
				for _, entry := range areaEntries {
					area := entry["area"]
					if area == nil {
						continue
					}
					areaSummary := optionalMap(entry["areaSummary"])
					activity.Areas = append(activity.Areas, map[string]any{
						"area":        area,
						"areaSummary": areaSummary,
					})
					if areaKm2, ok := numberFromMap(areaSummary, "areaKm2"); ok {
						totalAreaKm2 += areaKm2
					}
				}
				if len(activity.Areas) > 0 {
					activity.Area = activity.Areas[0]["area"]
					activity.AreaSummary = optionalMap(activity.Areas[0]["areaSummary"])
					activity.AffectedAreaKm2 = totalAreaKm2
				}
			}

			if activity.Area == nil {
				area := data["area"]
				if area == nil {
					return nil, fmt.Errorf("activity %q is missing polygon area", task.GetString("name"))
				}
				activity.Area = area
				activity.AreaSummary = optionalMap(data["areaSummary"])
				if areaKm2, ok := numberFromMap(activity.AreaSummary, "areaKm2"); ok {
					activity.AffectedAreaKm2 = areaKm2
				}
			}

			if activity.Area == nil {
				return nil, fmt.Errorf("activity %q is missing polygon area", task.GetString("name"))
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
			normalizedMultipliers := make(map[string]float64, len(simulationSpecies))
			for _, species := range simulationSpecies {
				value, ok := multipliers[species]
				if !ok {
					value = 1
				}
				if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
					return nil, fmt.Errorf("fishing activity %q has invalid effort multiplier for %s", task.GetString("name"), species)
				}
				activity.AffectedSpecies = append(activity.AffectedSpecies, species)
				normalizedMultipliers[species] = value
			}
			activity.SpeciesEffortMultipliers = normalizedMultipliers
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

	if hasPlanRange {
		durationDays := daysBetween(planStart, planEnd)
		if durationDays < 1 {
			durationDays = 1
		}
		ticks := int(math.Ceil(float64(durationDays) / float64(input.TickDurationDays)))
		if ticks < 1 {
			ticks = 1
		}

		input.PlanStart = planStart.Format("2006-01-02")
		input.PlanEnd = planEnd.Format("2006-01-02")
		input.DurationDays = durationDays
		input.SimulationTicks = ticks
		input.SampleEvery = sampleEveryForSimulationTicks(ticks)
	}

	return input, nil
}

func impactOverrideFromOptions(options any, activityType string) (float64, bool) {
	optionMap := optionalMap(options)
	if optionMap == nil {
		return 0, false
	}

	impacts := optionalMap(optionMap["demoActivityImpacts"])
	if impacts == nil {
		impacts = optionalMap(optionMap["activityImpacts"])
	}
	if impacts == nil {
		return 0, false
	}

	value, ok := numberFromMap(impacts, activityType)
	if !ok {
		return 0, false
	}
	if value < 0 {
		value = 0
	}
	if value > 5 {
		value = 5
	}
	return value, true
}

func applySimulationActivityImpactOverrides(options any, input *normalizedSimulationInput) {
	if input == nil {
		return
	}

	parameterNameByActivityType := map[string]string{
		"trawlArea": "trawlingImpact",
		"windFarm":  "noiseImpact",
		"seaLane":   "rotorImpact",
	}

	for index := range input.Activities {
		activity := &input.Activities[index]
		impact, ok := impactOverrideFromOptions(options, activity.Type)
		if !ok {
			continue
		}
		if activity.Parameters == nil {
			activity.Parameters = map[string]any{}
		}
		activity.Parameters["impact"] = impact
		if parameterName := parameterNameByActivityType[activity.Type]; parameterName != "" {
			activity.Parameters[parameterName] = impact
		}
	}
}

func disabledSimulationTaskIds(options any) map[string]bool {
	optionMap := optionalMap(options)
	if optionMap == nil {
		return nil
	}

	raw, ok := optionMap["disabledTaskIds"]
	if !ok {
		raw = optionMap["demoDisabledTaskIds"]
	}
	rawIds, ok := raw.([]any)
	if !ok || len(rawIds) == 0 {
		return nil
	}

	disabled := make(map[string]bool, len(rawIds))
	for _, rawId := range rawIds {
		id, ok := rawId.(string)
		if !ok {
			continue
		}
		id = strings.TrimSpace(id)
		if id != "" {
			disabled[id] = true
		}
	}
	return disabled
}

func applyDisabledSimulationTasks(options any, input *normalizedSimulationInput) {
	if input == nil || len(input.Activities) == 0 {
		return
	}
	disabled := disabledSimulationTaskIds(options)
	if len(disabled) == 0 {
		return
	}

	activities := input.Activities[:0]
	for _, activity := range input.Activities {
		if disabled[activity.ID] {
			continue
		}
		activities = append(activities, activity)
	}
	input.Activities = activities
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

	if input != nil && input.SimulationTicks > 0 {
		if _, ok := merged["maxSteps"]; !ok {
			if _, ok := merged["max_steps"]; !ok {
				merged["max_steps"] = input.SimulationTicks
			}
		}
		if _, ok := merged["sampleEvery"]; !ok {
			if _, ok := merged["sample_every"]; !ok {
				merged["sample_every"] = input.SampleEvery
			}
		}
		if _, ok := merged["tickDurationDays"]; !ok {
			if _, ok := merged["tick_duration_days"]; !ok {
				merged["tick_duration_days"] = input.TickDurationDays
			}
		}
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
		status := existing.GetString("status")
		if status == "" || status == tilePopulationJobFailed {
			existing.Set("status", tilePopulationJobPending)
			existing.Set("lastError", "")
			existing.Set("leaseUntil", "")
			existing.Set("finishedAt", "")
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

func populateTileAssets(app core.App, tile *core.Record) error {
	x := tile.GetInt("x")
	y := tile.GetInt("y")
	zoom := tile.GetInt("zoom")

	if tile.GetString("satellite") == "" {
		image := mapbox.DownloadSatelliteTile(x, y, zoom)
		file, err := pngFileFromImage(image, "satellite.png")
		if err != nil {
			return err
		}
		tile.Set("satellite", file)
	}

	if tile.GetFloat("metersPerPixel") == 0 {
		bboxString := tile.GetString("bbox")
		tile.Set("metersPerPixel", mapbox.MeterPerPixelFromBboxAndZoom(zoom, bboxString))
	}

	if tile.GetString("heightmap") == "" {
		image := mapbox.DownloadHeightmapTile(x, y, zoom)
		if image == nil {
			log.Printf("tile %d/%d/%d: heightmap download failed; creating tile without heightmap", zoom, x, y)
			tile.Set("heightmap", "")
			tile.Set("metersPerPixel", tile.GetFloat("metersPerPixel"))
			tile.Set("landcoverStatus", tileAssetStatusPending)
			tile.Set("oceanDataStatus", "")
			return nil
		}

		collection, err := app.FindCollectionByNameOrId("heightmaps")
		if err != nil {
			return err
		}

		heightmap := core.NewRecord(collection)
		file, err := pngFileFromImage(image, "heightmap_original.png")
		if err != nil {
			return err
		}
		heightmap.Set("original", file)
		if err := onHeightmapCreate(heightmap, collection, app); err != nil {
			return err
		}
		if err := app.Save(heightmap); err != nil {
			return err
		}

		tile.Set("heightmap", heightmap.Id)
	}

	tile.Set("landcoverStatus", tileAssetStatusPending)
	tile.Set("oceanDataStatus", "")
	return nil
}

func imageDimensions(data []byte) (int, int, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return 0, 0, errors.New("image has invalid dimensions")
	}
	return cfg.Width, cfg.Height, nil
}

func landcoverTextureForInference(data []byte) ([]byte, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}

	bounds := src.Bounds()
	mask := image.NewGray(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	water := utils.Palette[0].Color
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			current := color.NRGBAModel.Convert(src.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			value := uint8(255)
			if current.R == water.R && current.G == water.G && current.B == water.B {
				value = 0
			}
			mask.SetGray(x, y, color.Gray{Y: value})
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, mask); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func fetchInferenceModels(
	source *http.Request,
	httpClient *http.Client,
	inferenceURL *url.URL,
) ([]inferenceModelSummary, []byte, int, string, error) {
	upURL := *inferenceURL
	upURL.Path = "/v1/models"
	upURL.RawQuery = ""

	req, err := http.NewRequestWithContext(source.Context(), http.MethodGet, upURL.String(), nil)
	if err != nil {
		return nil, nil, 0, "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Del("Accept-Encoding")
	req.Host = inferenceURL.Host

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, nil, 0, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, 0, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, body, resp.StatusCode, contentType, nil
	}

	var models []inferenceModelSummary
	if err := json.Unmarshal(body, &models); err != nil {
		return nil, body, resp.StatusCode, contentType, err
	}
	return models, body, resp.StatusCode, contentType, nil
}

func inferenceModelsToAgents(models []inferenceModelSummary) []simAgentSummary {
	agents := make([]simAgentSummary, 0, len(models))
	for _, model := range models {
		kind := "multi"
		if len(model.Files) == 0 {
			kind = "empty"
		} else if len(model.Files) == 1 {
			kind = "single"
		}
		name := firstNonEmptyString(model.ID, model.Name)
		if name == "" {
			name = "model"
		}
		agents = append(agents, simAgentSummary{
			Name:    name,
			Kind:    kind,
			Files:   append([]string{}, model.Files...),
			Species: append([]string(nil), model.Species...),
		})
	}
	return agents
}

func optionString(options any, names ...string) string {
	optionMap := optionalMap(options)
	if optionMap == nil {
		return ""
	}
	for _, name := range names {
		if value, ok := optionMap[name].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func optionInt(options any, names []string, fallback int) int {
	optionMap := optionalMap(options)
	if optionMap == nil {
		return fallback
	}
	for _, name := range names {
		if value, ok := numberFromMap(optionMap, name); ok {
			return int(math.Round(value))
		}
	}
	return fallback
}

func firstQueryValue(query url.Values, names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(query.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

func selectInferenceModel(
	models []inferenceModelSummary,
	query url.Values,
	options any,
) (inferenceModelSummary, error) {
	if len(models) == 0 {
		return inferenceModelSummary{}, errors.New("inference API returned no available models")
	}

	preferred := firstNonEmptyString(
		firstQueryValue(query, "modelId", "model", "agent", "agentSet", "agent_set", "agents"),
		optionString(options, "modelId", "model", "agent", "agentSet", "agent_set", "agents"),
	)
	if preferred != "" {
		for _, model := range models {
			if model.ID == preferred || model.Name == preferred {
				return model, nil
			}
		}
		log.Printf("inference: requested model %q was not found; falling back to %q", preferred, models[0].ID)
	}

	return models[0], nil
}

func inferenceRunID(seed string) string {
	if seed = strings.TrimSpace(seed); seed != "" {
		return fmt.Sprintf("mareld-%s-%d", seed, time.Now().UnixNano())
	}
	return fmt.Sprintf("mareld-%d", time.Now().UnixNano())
}

func buildInferenceRunRequest(
	runID string,
	model inferenceModelSummary,
	input *normalizedSimulationInput,
	query url.Values,
	options any,
	width int,
	height int,
) map[string]any {
	maxSteps := queryInt(query, []string{"maxSteps", "max_steps"}, input.SimulationTicks)
	if maxSteps < 0 {
		maxSteps = 0
	}
	sampleEvery := queryInt(query, []string{"sampleEvery", "sample_every"}, input.SampleEvery)
	if sampleEvery <= 0 {
		sampleEvery = 1
	}
	tickDurationDays := queryInt(query, []string{"tickDurationDays", "tick_duration_days"}, input.TickDurationDays)
	if tickDurationDays <= 0 {
		tickDurationDays = 1
	}
	replicates := queryInt(
		query,
		[]string{"runs", "runCount", "run_count", "replicates"},
		optionInt(options, []string{"runs", "runCount", "run_count", "replicates"}, 1),
	)
	if replicates < 1 {
		replicates = 1
	}

	grid := map[string]any{
		"width":             width,
		"height":            height,
		"coordinate_system": "EPSG:4326",
	}
	if bbox, ok := parseTileBBox(input.TileBBox); ok {
		grid["bbox"] = []float64{bbox[0], bbox[1], bbox[2], bbox[3]}
	}

	timeCfg := map[string]any{
		"max_steps":          maxSteps,
		"sample_every":       sampleEvery,
		"include_final":      queryBool(query, []string{"includeFinal", "include_final"}, true),
		"tick_duration_days": tickDurationDays,
	}
	if startDate := firstNonEmptyString(firstQueryValue(query, "startDate", "start_date"), input.PlanStart); startDate != "" {
		timeCfg["start_date"] = startDate
	}
	if endDate := firstNonEmptyString(firstQueryValue(query, "endDate", "end_date"), input.PlanEnd); endDate != "" {
		timeCfg["end_date"] = endDate
	}

	modelPayload := map[string]any{
		"id": model.ID,
	}
	if agentSet := firstNonEmptyString(firstQueryValue(query, "agentSet", "agent_set", "agent", "agents"), optionString(options, "agentSet", "agent_set", "agent", "agents")); agentSet != "" {
		modelPayload["agent_set"] = agentSet
	}
	if modelPath := firstNonEmptyString(firstQueryValue(query, "modelPath", "model_path"), optionString(options, "modelPath", "model_path")); modelPath != "" {
		modelPayload["model_path"] = modelPath
	}

	return map[string]any{
		"run_id":  runID,
		"model":   modelPayload,
		"grid":    grid,
		"time":    timeCfg,
		"species": append([]string(nil), model.Species...),
		// First MARELD integration intentionally skips ECOTWIN pressures until
		// the inference API supports the full activity set.
		"pressures": []any{},
		"output": map[string]any{
			"dtype":                 "float32",
			"tensor_order":          "frame,row,column,species",
			"include_summary":       true,
			"summary_normalization": "relative_to_initial",
			"replicates":            replicates,
		},
	}
}

func inferenceResultBodyForUI(body []byte, fallbackRunID string) ([]byte, string, error) {
	var envelope inferenceRunEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, "", err
	}
	if envelope.Status != "" && envelope.Status != "completed" {
		return nil, envelope.RunID, fmt.Errorf("inference run returned status %q", envelope.Status)
	}
	if envelope.Result == nil {
		return nil, envelope.RunID, errors.New("inference response is missing result")
	}

	runID := firstNonEmptyString(envelope.RunID, fallbackRunID)
	if value, ok := envelope.Result["run_id"].(string); ok {
		runID = firstNonEmptyString(value, runID)
	}
	if runID != "" {
		envelope.Result["simulation_id"] = runID
	}
	if summary, ok := envelope.Result["summary"]; ok {
		envelope.Result["biomass_summary"] = summary
		delete(envelope.Result, "summary")
	}

	uiBody, err := json.Marshal(envelope.Result)
	if err != nil {
		return nil, runID, err
	}
	return uiBody, runID, nil
}

func runMareldInference(
	re *core.RequestEvent,
	httpClient *http.Client,
	inferenceURL *url.URL,
	runRequest map[string]any,
	texture []byte,
	depth []byte,
	impactNoise []byte,
) ([]byte, int, string, string, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	requestJSON, err := json.Marshal(runRequest)
	if err != nil {
		return nil, 0, "", "", err
	}
	if err := writer.WriteField("request", string(requestJSON)); err != nil {
		return nil, 0, "", "", err
	}

	texturePart, err := writer.CreateFormFile("texture", "texture.png")
	if err != nil {
		return nil, 0, "", "", err
	}
	if _, err := texturePart.Write(texture); err != nil {
		return nil, 0, "", "", err
	}

	depthPart, err := writer.CreateFormFile("depth", "depth.png")
	if err != nil {
		return nil, 0, "", "", err
	}
	if _, err := depthPart.Write(depth); err != nil {
		return nil, 0, "", "", err
	}

	if len(impactNoise) > 0 {
		impactNoisePart, err := writer.CreateFormFile("noise_impact", "noise_impact.png")
		if err != nil {
			return nil, 0, "", "", err
		}
		if _, err := impactNoisePart.Write(impactNoise); err != nil {
			return nil, 0, "", "", err
		}
	}

	if err := writer.Close(); err != nil {
		return nil, 0, "", "", err
	}

	upURL := *inferenceURL
	upURL.Path = "/v1/runs"
	upURL.RawQuery = ""

	req, err := http.NewRequestWithContext(re.Request.Context(), http.MethodPost, upURL.String(), &buf)
	if err != nil {
		return nil, 0, "", "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	req.Header.Del("Accept-Encoding")
	req.Host = inferenceURL.Host

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, "", "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, "", "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return body, resp.StatusCode, contentType, "", nil
	}

	fallbackRunID, _ := runRequest["run_id"].(string)
	uiBody, runID, err := inferenceResultBodyForUI(body, fallbackRunID)
	if err != nil {
		return body, resp.StatusCode, contentType, runID, err
	}
	return uiBody, http.StatusOK, "application/json", runID, nil
}

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnRecordCreateRequest("tiles").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := populateTileAssets(app, e.Record); err != nil {
			return err
		}

		if err := e.Next(); err != nil {
			return err
		}

		return ensureTilePopulationJob(app, e.Record.Id, tilePopulationKindLandcover)
	})

	app.OnRecordCreateRequest("landcovers").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := onLandcoverCreate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return e.Next()
	})

	app.OnRecordUpdateRequest("landcovers").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := onLandcoverUpdate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return e.Next()
	})

	app.OnRecordCreateRequest("heightmaps").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := onHeightmapCreate(e.Record, e.Collection, app); err != nil {
			return err
		}

		return e.Next()
	})

	inferenceURLRaw := firstNonEmptyString(
		os.Getenv("SIMULATION_INFERENCE_URL"),
		os.Getenv("MARELD_API_URL"),
		"http://localhost:8000",
	)
	inferenceURL, err := url.Parse(inferenceURLRaw)
	if err != nil {
		log.Fatal("Invalid simulation inference URL")
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
		// - sends a model-ready run request to MARELD inference
		// - stores it in simulations.simulationId
		// - forwards the response and caches it via file fields
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

			normalizedInput, err := buildNormalizedSimulationInput(app, plan, tile)
			if err != nil {
				return re.BadRequestError("Management plan cannot be normalized for simulation: "+err.Error(), err)
			}
			applyDisabledSimulationTasks(simulation.Get("options"), normalizedInput)
			if len(normalizedInput.Activities) == 0 {
				return re.BadRequestError("Management plan has no enabled activities for simulation.", nil)
			}
			applySimulationActivityImpactOverrides(simulation.Get("options"), normalizedInput)

			if _, err := mergeSimulationOptions(simulation.Get("options"), normalizedInput); err != nil {
				return re.InternalServerError("Failed to encode simulation input.", err)
			}
			runRawQuery := applySimulationTimelineDefaults(re.Request.URL.RawQuery, normalizedInput)
			re.Request.URL.RawQuery = runRawQuery

			simulation.Set("inputJson", normalizedInput)
			simulation.Set("status", "running")
			simulation.Set("resultJson", "")
			simulation.Set("resultNpz", "")
			if err := app.Save(simulation); err != nil {
				return re.InternalServerError("Failed to store normalized simulation input.", err)
			}

			failBadRequest := func(message string, err error) error {
				markSimulationFailed(app, simulation)
				return re.BadRequestError(message, err)
			}
			failInternal := func(message string, err error) error {
				markSimulationFailed(app, simulation)
				return re.InternalServerError(message, err)
			}
			failBlob := func(status int, contentType string, body []byte) error {
				markSimulationFailed(app, simulation)
				return re.Blob(status, contentType, body)
			}
			tileName := firstNonEmptyString(tile.GetString("name"), tile.Id)

			landcoverRel := tile.GetString("landcover")
			if landcoverRel == "" {
				return failBadRequest(
					fmt.Sprintf("Tile %q is missing generated landcover. Generate tile assets before running inference.", tileName),
					nil,
				)
			}
			landcover, err := app.FindRecordById("landcovers", landcoverRel)
			if err != nil {
				return failInternal("Failed to load landcover record.", err)
			}
			textureName := firstNonEmptyString(
				landcover.GetString("color_100"),
			)
			if textureName == "" {
				return failBadRequest(
					fmt.Sprintf("Generated landcover for tile %q is missing color_100 texture file.", tileName),
					nil,
				)
			}

			oceanRel := tile.GetString("oceanData")
			if oceanRel == "" {
				return failBadRequest(
					fmt.Sprintf("Tile %q is missing generated ocean depth data. Generate tile assets before running inference.", tileName),
					nil,
				)
			}

			ocean, err := app.FindRecordById("oceanData", oceanRel)
			if err != nil {
				return failInternal("Failed to load oceanData record.", err)
			}

			depthName := ocean.GetString("depth")
			if depthName == "" {
				return failBadRequest(
					fmt.Sprintf("Generated ocean data for tile %q is missing depth file.", tileName),
					nil,
				)
			}

			textureBytes, err := readRecordFileBytes(app, landcover, textureName)
			if err != nil {
				return failInternal("Failed to read landcover texture file.", err)
			}
			textureBytes, err = landcoverTextureForInference(textureBytes)
			if err != nil {
				return failBadRequest("landcover texture cannot be converted to inference water/land mask.", err)
			}

			depthBytes, err := readRecordFileBytes(app, ocean, depthName)
			if err != nil {
				return failInternal("Failed to read ocean depth file.", err)
			}

			format := strings.ToLower(firstNonEmptyString(re.Request.URL.Query().Get("format"), "base64"))
			if format != "base64" {
				return failBadRequest("MARELD inference currently supports only format=base64 through the UI bridge.", nil)
			}

			textureWidth, textureHeight, err := imageDimensions(textureBytes)
			if err != nil {
				return failBadRequest("landcover texture is not a readable image.", err)
			}
			depthWidth, depthHeight, err := imageDimensions(depthBytes)
			if err != nil {
				return failBadRequest("ocean depth file is not a readable image.", err)
			}
			if textureWidth != depthWidth || textureHeight != depthHeight {
				return failBadRequest("landcover texture and ocean depth images must have matching dimensions.", nil)
			}

			impactNoiseBytes, err := impactNoisePNGForInference(normalizedInput, textureWidth, textureHeight)
			if err != nil {
				return failInternal("Failed to build noise_impact raster.", err)
			}

			models, modelsBody, modelsStatus, modelsContentType, err := fetchInferenceModels(
				re.Request,
				httpClient,
				inferenceURL,
			)
			if err != nil {
				return failInternal("Failed to fetch inference models.", err)
			}
			if modelsStatus < 200 || modelsStatus > 299 {
				return failBlob(modelsStatus, modelsContentType, modelsBody)
			}

			model, err := selectInferenceModel(models, re.Request.URL.Query(), simulation.Get("options"))
			if err != nil {
				return failInternal("Failed to select inference model.", err)
			}
			if len(model.Species) == 0 {
				return failInternal("Selected inference model does not define output species.", nil)
			}

			runID := inferenceRunID(simRecordId)
			runRequest := buildInferenceRunRequest(
				runID,
				model,
				normalizedInput,
				re.Request.URL.Query(),
				simulation.Get("options"),
				textureWidth,
				textureHeight,
			)

			resultBody, resultStatus, resultContentType, returnedRunID, err := runMareldInference(
				re,
				httpClient,
				inferenceURL,
				runRequest,
				textureBytes,
				depthBytes,
				impactNoiseBytes,
			)
			if err != nil {
				return failInternal("Failed to run MARELD inference.", err)
			}
			if resultStatus < 200 || resultStatus > 299 {
				return failBlob(resultStatus, resultContentType, resultBody)
			}

			if returnedRunID == "" {
				returnedRunID = runID
			}
			resultFile, err := filesystem.NewFileFromBytes(resultBody, "simulation_result.json")
			if err != nil {
				return failInternal("Failed to create cached simulation result file.", err)
			}

			simulation.Set("simulationId", returnedRunID)
			simulation.Set("resultJson", resultFile)
			simulation.Set("status", "completed")
			if err := app.Save(simulation); err != nil {
				return failInternal("Failed to cache completed simulation result.", err)
			}

			return re.Blob(http.StatusOK, resultContentType, resultBody)
		})

		e.Router.GET("/simulate/agents", func(re *core.RequestEvent) error {
			models, body, status, contentType, err := fetchInferenceModels(
				re.Request,
				httpClient,
				inferenceURL,
			)
			if err != nil {
				return re.InternalServerError("Failed to fetch inference models.", err)
			}
			if status < 200 || status > 299 {
				return re.Blob(status, contentType, body)
			}

			body, err = json.Marshal(inferenceModelsToAgents(models))
			if err != nil {
				return re.InternalServerError("Failed to map inference models.", err)
			}
			return re.Blob(http.StatusOK, "application/json", body)
		})

		e.Router.GET("/simulate/{path...}", func(re *core.RequestEvent) error {
			return re.NotFoundError("Simulation route not found.", nil)
		})

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
