package utils

import (
	"encoding/json"
	"image"
	"image/color"
	"math"
	"os"
	"path"
	"strconv"
	"strings"

	"github.com/disintegration/imaging"
	"github.com/pocketbase/pocketbase/core"
)

type Landcover struct {
	Color   color.NRGBA
	Texture color.NRGBA
	Name    string
}

var Palette = []Landcover{
	{Color: color.NRGBA{R: 65, G: 155, B: 223, A: 255}, Name: "water", Texture: color.NRGBA{R: 255, G: 255, B: 0, A: 255}},
	{Color: color.NRGBA{R: 57, G: 125, B: 73, A: 255}, Name: "trees", Texture: color.NRGBA{R: 0, G: 255, B: 255, A: 255}},
	{Color: color.NRGBA{R: 136, G: 176, B: 83, A: 255}, Name: "grass", Texture: color.NRGBA{R: 0, G: 255, B: 0, A: 255}},
	{Color: color.NRGBA{R: 122, G: 135, B: 198, A: 255}, Name: "flooded_vegetation", Texture: color.NRGBA{R: 255, G: 0, B: 0, A: 255}},
	{Color: color.NRGBA{R: 228, G: 150, B: 53, A: 255}, Name: "crops", Texture: color.NRGBA{R: 0, G: 255, B: 255, A: 0}},
	{Color: color.NRGBA{R: 223, G: 195, B: 90, A: 255}, Name: "shrub", Texture: color.NRGBA{R: 255, G: 0, B: 255, A: 255}},
	{Color: color.NRGBA{R: 196, G: 40, B: 27, A: 255}, Name: "built", Texture: color.NRGBA{R: 255, G: 0, B: 0, A: 255}},
	{Color: color.NRGBA{R: 165, G: 155, B: 143, A: 255}, Name: "bare", Texture: color.NRGBA{R: 0, G: 255, B: 0, A: 0}},
	{Color: color.NRGBA{R: 179, G: 159, B: 225, A: 255}, Name: "snow", Texture: color.NRGBA{R: 255, G: 255, B: 255, A: 255}},
	// Add more colors with names as needed
}

// RGB to HSL conversion
func RgbToHSL(c color.NRGBA) (float64, float64, float64) {
	r := float64(c.R) / 255.0
	g := float64(c.G) / 255.0
	b := float64(c.B) / 255.0
	max := math.Max(math.Max(r, g), b)
	min := math.Min(math.Min(r, g), b)
	h, s, l := 0.0, 0.0, (max+min)/2.0

	if max != min {
		diff := max - min
		if l > 0.5 {
			s = diff / (2.0 - max - min)
		} else {
			s = diff / (max + min)
		}
		switch max {
		case r:
			h = (g - b) / diff
			if g < b {
				h += 6
			}
		case g:
			h = (b-r)/diff + 2
		case b:
			h = (r-g)/diff + 4
		}
		h /= 6
	}

	return h, s, l
}

// HSL color distance based on your JavaScript logic
func HslColorDistance(c1, c2 color.NRGBA) float64 {
	h1, s1, l1 := RgbToHSL(c1)
	h2, s2, l2 := RgbToHSL(c2)

	hDiff := h1 - h2
	sDiff := s1 - s2
	lDiff := l1 - l2

	return math.Sqrt(hDiff*hDiff) + math.Sqrt(sDiff*sDiff)/2 + math.Sqrt(lDiff*lDiff)/3
}

// Function to find the closest color from the palette
func ClosestColor(c color.Color, palette []Landcover) color.NRGBA {
	minDistance := math.MaxFloat64
	var closest color.NRGBA
	c1 := color.NRGBAModel.Convert(c).(color.NRGBA)
	for _, pc := range palette {
		d := HslColorDistance(c1, pc.Color)
		if d < minDistance {
			minDistance = d
			closest = pc.Color
		}
	}
	return closest
}

func CalculateColorPercentages(img image.Image, palette []Landcover) (string, error) {
	// Calculate color percentages and return a JSON map with color names
	colorCounts := make(map[string]int)
	totalPixels := 0

	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			currentColor := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			closestColorName := GetClosestColorName(currentColor, palette)
			colorCounts[closestColorName]++
			totalPixels++
		}
	}

	// Calculate percentages
	colorPercentages := make(map[string]float64)
	for name, count := range colorCounts {
		colorPercentages[name] = (float64(count) / float64(totalPixels)) * 100
	}

	// Convert to JSON
	jsonPercentages, err := json.Marshal(colorPercentages)
	if err != nil {
		return "", err
	}

	return string(jsonPercentages), nil
}

// Helper function to find the closest color by name
func GetClosestColorName(c color.NRGBA, palette []Landcover) string {
	minDistance := math.MaxFloat64
	closestName := ""
	for _, cnPair := range palette {
		d := HslColorDistance(c, cnPair.Color) // Assumes hslColorDistance is defined
		if d < minDistance {
			minDistance = d
			closestName = cnPair.Name
		}
	}
	return closestName
}

func GetImageForField(record *core.Record, collection *core.Collection, dir string, fieldName string, newPrefix string) (image.Image, string) {
	fileName := record.GetString(fieldName)
	filePath := path.Join(
		dir,
		"storage",
		collection.Id,
		record.Id,
		fileName,
	)
	src, _ := imaging.Open(filePath)

	newFilepath := path.Join(
		dir,
		"storage",
		collection.Id,
		record.Id,
		newPrefix+"_"+fileName,
	)

	return src, newFilepath
}

func GetFilePathForField(record *core.Record, collection *core.Collection, dir string, fieldName string) string {
	recordFolder := path.Join(dir, "storage", collection.Id, record.Id)
	if _, err := os.Stat(recordFolder); os.IsNotExist(err) {
		os.MkdirAll(recordFolder, os.ModePerm)
	}

	filePath := path.Join(
		recordFolder,
		fieldName+".png",
	)
	return filePath
}

func GetFileNameForPath(filePath string) string {
	return strings.Split(filePath, "/")[len(strings.Split(filePath, "/"))-1]
}

func CoordsFromBboxString(bboxString string) []float64 {
	bboxString = strings.Replace(bboxString, "[", "", -1)
	bboxString = strings.Replace(bboxString, "]", "", -1)

	values := strings.Split(bboxString, ",")

	coords := make([]float64, 0)
	for _, value := range values {
		coord, _ := strconv.ParseFloat(value, 64)
		coords = append(coords, coord)
	}
	return coords
}

func GetCenterOfBbox(bbox []float64) (float64, float64) {
	return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
}
