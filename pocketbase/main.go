package main

import (
	"app/lib/mapbox"
	utils "app/lib/utils"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"image/color"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
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

		return app.Save(heightmap)
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

			// Find the tile that references this simulation record (tiles.simulations is a multi-relation).
			tile, err := app.FindFirstRecordByFilter(
				"tiles",
				`simulations.id ?= {:sid}`,
				dbx.Params{"sid": simRecordId},
			)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return re.NotFoundError("No tile found for this simulation.", err)
				}
				return re.InternalServerError("Failed to resolve tile for simulation.", err)
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

			options := simulation.Get("options")
			optionsJSON := []byte("{}")
			if options != nil {
				if raw, err := json.Marshal(options); err == nil {
					optionsJSON = raw
				}
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
				return re.InternalServerError("Failed to upload map to simulation upstream.", err)
			}
			if uploadStatus < 200 || uploadStatus > 299 {
				return re.Blob(uploadStatus, uploadContentType, uploadBody)
			}

			var parsed simulationUploadResponse
			if err := json.Unmarshal(uploadBody, &parsed); err != nil || parsed.ID == "" {
				return re.InternalServerError("Invalid simulation upstream upload response.", err)
			}

			// store the upstream simulation_id and clear previous cached result files
			simulation.Set("simulationId", parsed.ID)
			simulation.Set("resultJson", "")
			simulation.Set("resultNpz", "")
			if err := app.Save(simulation); err != nil {
				return re.InternalServerError("Failed to update simulation record with simulationId.", err)
			}

			return handleSimulateRunAndCache(app, httpClient, targetURL, re, parsed.ID)
		})

		e.Router.POST("/simulate/upload", func(re *core.RequestEvent) error {
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
