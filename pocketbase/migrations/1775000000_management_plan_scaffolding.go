package migrations

import (
	"slices"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		plans, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		if plans.Fields.GetByName("area") == nil {
			if err := plans.Fields.AddMarshaledJSON([]byte(`{
				"hidden": false,
				"id": "jsonarea01",
				"maxSize": 2000000,
				"name": "area",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "json"
			}`)); err != nil {
				return err
			}
		}

		if plans.Fields.GetByName("areaSummary") == nil {
			if err := plans.Fields.AddMarshaledJSON([]byte(`{
				"hidden": false,
				"id": "jsonareas1",
				"maxSize": 2000000,
				"name": "areaSummary",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "json"
			}`)); err != nil {
				return err
			}
		}

		if err := app.Save(plans); err != nil {
			return err
		}

		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField)
		if !ok {
			return app.Save(tasks)
		}

		for _, value := range []string{"hunting", "forestry", "infrastructure"} {
			if !slices.Contains(taskTypeField.Values, value) {
				taskTypeField.Values = append(taskTypeField.Values, value)
			}
		}

		return app.Save(tasks)
	}, func(app core.App) error {
		plans, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		plans.Fields.RemoveById("jsonarea01")
		plans.Fields.RemoveById("jsonareas1")

		if err := app.Save(plans); err != nil {
			return err
		}

		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField)
		if !ok {
			return app.Save(tasks)
		}

		filtered := make([]string, 0, len(taskTypeField.Values))
		for _, value := range taskTypeField.Values {
			switch value {
			case "hunting", "forestry", "infrastructure":
				continue
			default:
				filtered = append(filtered, value)
			}
		}
		taskTypeField.Values = filtered

		return app.Save(tasks)
	})
}
