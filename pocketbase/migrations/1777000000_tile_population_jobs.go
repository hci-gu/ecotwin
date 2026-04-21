package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const tilePopulationJobsCollectionID = "tilepopjobs001"

func init() {
	m.Register(func(app core.App) error {
		jsonData := `{
			"id": "tilepopjobs001",
			"created": "2026-04-13 00:00:00.000Z",
			"updated": "2026-04-13 00:00:00.000Z",
			"name": "tilePopulationJobs",
			"type": "base",
			"system": false,
			"fields": [
				{
					"system": false,
					"id": "tpjobtile1",
					"name": "tile",
					"type": "relation",
					"required": true,
					"presentable": false,
					"collectionId": "ewi0x38j6dujau8",
					"cascadeDelete": true,
					"minSelect": 1,
					"maxSelect": 1
				},
				{
					"system": false,
					"id": "tpjobkind1",
					"name": "kind",
					"type": "select",
					"required": true,
					"presentable": false,
					"maxSelect": 1,
					"values": [
						"landcover",
						"oceanData"
					]
				},
				{
					"system": false,
					"id": "tpjobstat1",
					"name": "status",
					"type": "select",
					"required": true,
					"presentable": false,
					"maxSelect": 1,
					"values": [
						"pending",
						"processing",
						"succeeded",
						"failed",
						"skipped"
					]
				},
				{
					"system": false,
					"id": "tpjobatmp1",
					"name": "attemptCount",
					"type": "number",
					"required": false,
					"presentable": false,
					"min": 0,
					"max": null,
					"onlyInt": true
				},
				{
					"system": false,
					"id": "tpjoberr01",
					"name": "lastError",
					"type": "text",
					"required": false,
					"presentable": false,
					"min": 0,
					"max": 4000,
					"pattern": ""
				},
				{
					"system": false,
					"id": "tpjoblease",
					"name": "leaseUntil",
					"type": "date",
					"required": false,
					"presentable": false,
					"min": "",
					"max": ""
				},
				{
					"system": false,
					"id": "tpjobstart",
					"name": "startedAt",
					"type": "date",
					"required": false,
					"presentable": false,
					"min": "",
					"max": ""
				},
				{
					"system": false,
					"id": "tpjobfin01",
					"name": "finishedAt",
					"type": "date",
					"required": false,
					"presentable": false,
					"min": "",
					"max": ""
				}
			],
			"indexes": [],
			"listRule": null,
			"viewRule": null,
			"createRule": null,
			"updateRule": null,
			"deleteRule": null,
			"options": {}
		}`

		collection := &core.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		tiles, err := app.FindCollectionByNameOrId("ewi0x38j6dujau8")
		if err != nil {
			return err
		}

		if tiles.Fields.GetByName("landcoverStatus") == nil {
			if err := tiles.Fields.AddMarshaledJSON([]byte(`{
				"system": false,
				"id": "tilelcstat",
				"name": "landcoverStatus",
				"type": "select",
				"required": false,
				"presentable": false,
				"maxSelect": 1,
				"values": [
					"pending",
					"processing",
					"ready",
					"failed"
				]
			}`)); err != nil {
				return err
			}
		}

		if tiles.Fields.GetByName("oceanDataStatus") == nil {
			if err := tiles.Fields.AddMarshaledJSON([]byte(`{
				"system": false,
				"id": "tileocstat",
				"name": "oceanDataStatus",
				"type": "select",
				"required": false,
				"presentable": false,
				"maxSelect": 1,
				"values": [
					"pending",
					"processing",
					"ready",
					"failed",
					"skipped"
				]
			}`)); err != nil {
				return err
			}
		}

		return app.Save(tiles)
	}, func(app core.App) error {
		tiles, err := app.FindCollectionByNameOrId("ewi0x38j6dujau8")
		if err != nil {
			return err
		}

		tiles.Fields.RemoveById("tilelcstat")
		tiles.Fields.RemoveById("tileocstat")
		if err := app.Save(tiles); err != nil {
			return err
		}

		collection, err := app.FindCollectionByNameOrId(tilePopulationJobsCollectionID)
		if err != nil {
			return err
		}

		return app.Delete(collection)
	})
}
