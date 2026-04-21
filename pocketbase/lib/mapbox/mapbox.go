package mapbox

import (
	utils "app/lib/utils"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/dghubble/sling"
)

var baseUrl = "https://api.mapbox.com/v4"
var accessToken = firstNonEmptyEnv("VITE_MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_TOKEN")

func firstNonEmptyEnv(keys ...string) string {
	for _, key := range keys {
		if value := os.Getenv(key); value != "" {
			return value
		}
	}

	return ""
}

func DownloadTile(x int, y int, zoom int, typeStr string) image.Image {
	type Params struct {
		AccessToken string `url:"access_token"`
	}
	params := &Params{
		AccessToken: accessToken,
	}
	url := fmt.Sprintf("%s/%s/%d/%d/%d@2x.png", baseUrl, typeStr, zoom, x, y)
	log.Printf("%s", url)
	req, err := sling.New().Get(url + "/").QueryStruct(params).Request()

	if err != nil {
		fmt.Printf("Failed to prepare request: %v\n", err)
		return nil
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Failed to download tile: %v\n", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Failed to download tile, HTTP status code: %d\n", resp.StatusCode)
		return nil
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("Failed to read response body: %v\n", err)
		return nil
	}

	// Decode the image
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		fmt.Printf("Failed to decode image: %v\n", err)
		return nil
	}

	return img
}

func DownloadSatelliteTile(x int, y int, zoom int) image.Image {
	return DownloadTile(x, y, zoom, "mapbox.satellite")
}

func DownloadHeightmapTile(x int, y int, zoom int) image.Image {
	return DownloadTile(x, y, zoom, "mapbox.terrain-rgb")
}

func ReadDistanceTable() (map[string]map[string]float64, error) {
	// Open the JSON file
	filePath := os.Getenv("DISTANCE_TABLE_PATH")
	if filePath == "" {
		// Default path when not specified by the environment variable
		filePath = "./distance_table.json"
	}
	file, err := os.Open(filePath)
	if err != nil {
		fmt.Println("Error opening file:", err)
		return nil, err
	}
	defer file.Close()

	// Decode the JSON file into a map
	var distanceTable map[string]map[string]float64
	err = json.NewDecoder(file).Decode(&distanceTable)
	if err != nil {
		fmt.Println("Error decoding JSON:", err)
		return nil, err
	}

	return distanceTable, nil
}

func MetersPerPixelForZoomAndLatitude(zoom int, latitude float64) float64 {
	distanceTable, _ := ReadDistanceTable()
	// round latitude to closest 20
	latitude = float64(int(latitude/20)) * 20
	value, _ := distanceTable[fmt.Sprintf("%d", zoom)][fmt.Sprintf("%f", latitude)]

	return value
}

func MeterPerPixelFromBboxAndZoom(zoom int, bboxString string) float64 {
	values := utils.CoordsFromBboxString(bboxString)
	_, lat := utils.GetCenterOfBbox(values)

	return MetersPerPixelForZoomAndLatitude(zoom, lat)
}
