package main

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/url"
	"testing"
)

func TestApplyDisabledSimulationTasksRemovesMatchingActivities(t *testing.T) {
	input := &normalizedSimulationInput{
		Activities: []normalizedActivityInput{
			{ID: "keep", Name: "Keep"},
			{ID: "2ozfhkbzh8d6oxi", Name: "Disabled"},
		},
	}

	applyDisabledSimulationTasks(map[string]any{
		"disabledTaskIds": []any{"2ozfhkbzh8d6oxi"},
	}, input)

	if len(input.Activities) != 1 {
		t.Fatalf("expected one enabled activity, got %d", len(input.Activities))
	}
	if input.Activities[0].ID != "keep" {
		t.Fatalf("expected disabled task to be removed, got %+v", input.Activities)
	}
}

func TestInferenceModelsToAgentsMapsModelMetadata(t *testing.T) {
	agents := inferenceModelsToAgents([]inferenceModelSummary{
		{
			ID:      "baltic-default",
			Name:    "Mareld2",
			Files:   []string{"cod.npz"},
			Species: []string{"codfish", "seals"},
		},
		{
			ID:      "empty-model",
			Species: []string{"phytoplankton"},
		},
	})

	if len(agents) != 2 {
		t.Fatalf("expected two agents, got %d", len(agents))
	}
	if agents[0].Name != "baltic-default" || agents[0].Kind != "single" {
		t.Fatalf("unexpected first agent mapping: %+v", agents[0])
	}
	if agents[1].Kind != "empty" {
		t.Fatalf("expected model without files to map to empty, got %+v", agents[1])
	}
	if agents[0].Species[1] != "seals" {
		t.Fatalf("expected species to be copied from model, got %+v", agents[0].Species)
	}
}

func TestBuildInferenceRunRequestUsesModelSpeciesAndSkipsPressures(t *testing.T) {
	query := url.Values{}
	query.Set("max_steps", "730")
	query.Set("sample_every", "10")
	query.Set("runs", "20")

	request := buildInferenceRunRequest(
		"run-123",
		inferenceModelSummary{
			ID:      "baltic-default",
			Species: []string{"benthic_community", "phytoplankton"},
		},
		&normalizedSimulationInput{
			TileBBox:         "[11.1,57.7,11.2,57.8]",
			TickDurationDays: 1,
			SimulationTicks:  365,
			SampleEvery:      4,
			PlanStart:        "2026-01-01",
			PlanEnd:          "2027-01-01",
		},
		query,
		map[string]any{"runs": 5},
		100,
		100,
	)

	species := request["species"].([]string)
	if len(species) != 2 || species[0] != "benthic_community" {
		t.Fatalf("expected model species in request, got %+v", species)
	}

	pressures := request["pressures"].([]any)
	if len(pressures) != 0 {
		t.Fatalf("expected pressures to be skipped for first integration, got %+v", pressures)
	}

	timeCfg := request["time"].(map[string]any)
	if timeCfg["max_steps"] != 730 || timeCfg["sample_every"] != 10 {
		t.Fatalf("expected query timeline overrides, got %+v", timeCfg)
	}

	output := request["output"].(map[string]any)
	if output["replicates"] != 20 {
		t.Fatalf("expected query run count to override options, got %+v", output)
	}
}

func TestLandcoverTextureForInferenceBuildsBinaryWaterLandMask(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 3, 1))
	src.SetNRGBA(0, 0, color.NRGBA{R: 65, G: 155, B: 223, A: 255})
	src.SetNRGBA(1, 0, color.NRGBA{R: 57, G: 125, B: 73, A: 255})
	src.SetNRGBA(2, 0, color.NRGBA{R: 1, G: 1, B: 1, A: 255})

	var input bytes.Buffer
	if err := png.Encode(&input, src); err != nil {
		t.Fatalf("failed to encode source image: %v", err)
	}

	converted, err := landcoverTextureForInference(input.Bytes())
	if err != nil {
		t.Fatalf("landcoverTextureForInference returned error: %v", err)
	}

	mask, err := png.Decode(bytes.NewReader(converted))
	if err != nil {
		t.Fatalf("failed to decode converted mask: %v", err)
	}

	expected := []uint8{0, 255, 255}
	for x, want := range expected {
		got := color.GrayModel.Convert(mask.At(x, 0)).(color.Gray).Y
		if got != want {
			t.Fatalf("pixel %d: expected %d, got %d", x, want, got)
		}
	}
}

func TestImpactNoisePNGForInferenceRasterizesAndBlursNoiseActivities(t *testing.T) {
	input := &normalizedSimulationInput{
		TileBBox: "[0,0,10,10]",
		Activities: []normalizedActivityInput{
			{
				Type: "windFarm",
				Area: map[string]any{
					"type": "Polygon",
					"coordinates": []any{
						[]any{
							[]any{2.0, 2.0},
							[]any{8.0, 2.0},
							[]any{8.0, 8.0},
							[]any{2.0, 8.0},
							[]any{2.0, 2.0},
						},
					},
				},
				Parameters: map[string]any{"impact": 5.0},
			},
			{
				Type: "trawlArea",
				Area: map[string]any{
					"type": "Polygon",
					"coordinates": []any{
						[]any{
							[]any{0.0, 0.0},
							[]any{10.0, 0.0},
							[]any{10.0, 10.0},
							[]any{0.0, 10.0},
							[]any{0.0, 0.0},
						},
					},
				},
				Parameters: map[string]any{"impact": 5.0},
			},
		},
	}

	pngBytes, err := impactNoisePNGForInference(input, 20, 20)
	if err != nil {
		t.Fatalf("impactNoisePNGForInference returned error: %v", err)
	}

	img, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("failed to decode impact noise PNG: %v", err)
	}

	center := color.GrayModel.Convert(img.At(10, 10)).(color.Gray).Y
	corner := color.GrayModel.Convert(img.At(0, 0)).(color.Gray).Y
	edge := color.GrayModel.Convert(img.At(3, 10)).(color.Gray).Y

	if center <= 180 {
		t.Fatalf("expected wind farm center to be bright after rasterization, got %d", center)
	}
	if corner > 10 {
		t.Fatalf("expected trawl area to be ignored and far corner to stay near black, got %d", corner)
	}
	if edge == 0 || edge >= center {
		t.Fatalf("expected blur edge to be nonzero but dimmer than center, got edge=%d center=%d", edge, center)
	}
}

func TestInferenceResultBodyForUIUnwrapsEnvelope(t *testing.T) {
	body := []byte(`{
		"run_id": "run-123",
		"status": "completed",
		"result": {
			"dtype": "float32",
			"summary": {"groups": ["codfish"]},
			"biomass_b64": "AAAA"
		}
	}`)

	uiBody, runID, err := inferenceResultBodyForUI(body, "fallback-run")
	if err != nil {
		t.Fatalf("inferenceResultBodyForUI returned error: %v", err)
	}
	if runID != "run-123" {
		t.Fatalf("expected run ID from envelope, got %q", runID)
	}

	var result map[string]any
	if err := json.Unmarshal(uiBody, &result); err != nil {
		t.Fatalf("failed to unmarshal UI body: %v", err)
	}
	if result["simulation_id"] != "run-123" {
		t.Fatalf("expected simulation_id to be injected, got %+v", result)
	}
	if _, ok := result["biomass_summary"]; !ok {
		t.Fatalf("expected summary to map to biomass_summary, got %+v", result)
	}
	if _, ok := result["summary"]; ok {
		t.Fatalf("expected raw summary field to be removed, got %+v", result)
	}
}
