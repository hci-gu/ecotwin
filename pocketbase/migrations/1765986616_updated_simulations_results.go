package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		// add simulationId (runner UUID)
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "simid001",
			"name": "simulationId",
			"type": "text",
			"required": false,
			"presentable": false,
			"hidden": false,
			"min": 0,
			"max": 0,
			"pattern": "",
			"autogeneratePattern": "",
			"primaryKey": false
		}`)); err != nil {
			return err
		}

		// add cached results files
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "resjson1",
			"name": "resultJson",
			"type": "file",
			"required": false,
			"presentable": false,
			"hidden": false,
			"mimeTypes": [],
			"thumbs": [],
			"maxSelect": 1,
			"maxSize": 209715200,
			"protected": false
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "resnpz01",
			"name": "resultNpz",
			"type": "file",
			"required": false,
			"presentable": false,
			"hidden": false,
			"mimeTypes": [],
			"thumbs": [],
			"maxSelect": 1,
			"maxSize": 209715200,
			"protected": false
		}`)); err != nil {
			return err
		}

		// ensure simulationId uniqueness
		const uniqueIndex = "CREATE UNIQUE INDEX idx_simulations_simulation_id ON simulations (simulationId) WHERE simulationId != ''"
		has := false
		for _, idx := range collection.Indexes {
			if idx == uniqueIndex {
				has = true
				break
			}
		}
		if !has {
			collection.Indexes = append(collection.Indexes, uniqueIndex)
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		// remove fields
		collection.Fields.RemoveById("simid001")
		collection.Fields.RemoveById("resjson1")
		collection.Fields.RemoveById("resnpz01")

		// remove unique index
		const uniqueIndex = "CREATE UNIQUE INDEX idx_simulations_simulation_id ON simulations (simulationId) WHERE simulationId != ''"
		next := make([]string, 0, len(collection.Indexes))
		for _, idx := range collection.Indexes {
			if idx == uniqueIndex {
				continue
			}
			next = append(next, idx)
		}
		collection.Indexes = types.JSONArray[string](next)

		return app.Save(collection)
	})
}
