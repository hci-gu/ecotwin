package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		if taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField); ok {
			taskTypeField.Values = types.JSONArray[string]{"fishing", "construction"}
		}

		if err := app.Save(tasks); err != nil {
			return err
		}

		simulations, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		if simulations.Fields.GetByName("inputJson") == nil {
			if err := simulations.Fields.AddMarshaledJSON([]byte(`{
				"hidden": false,
				"id": "inputjson1",
				"maxSize": 2000000,
				"name": "inputJson",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "json"
			}`)); err != nil {
				return err
			}
		}

		if simulations.Fields.GetByName("status") == nil {
			if err := simulations.Fields.AddMarshaledJSON([]byte(`{
				"hidden": false,
				"id": "simstatus1",
				"maxSelect": 1,
				"name": "status",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "select",
				"values": ["pending", "running", "completed", "failed"]
			}`)); err != nil {
				return err
			}
		} else if statusField, ok := simulations.Fields.GetByName("status").(*core.SelectField); ok {
			statusField.Values = types.JSONArray[string]{"pending", "running", "completed", "failed"}
		}

		return app.Save(simulations)
	}, func(app core.App) error {
		simulations, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		simulations.Fields.RemoveById("inputjson1")
		simulations.Fields.RemoveById("simstatus1")

		if err := app.Save(simulations); err != nil {
			return err
		}

		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		if taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField); ok {
			taskTypeField.Values = types.JSONArray[string]{"landcover", "fishingPolicy", "hunting", "forestry", "infrastructure", "fishing"}
		}

		return app.Save(tasks)
	})
}
