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
			taskTypeField.Values = types.JSONArray[string]{
				"fishing",
				"construction",
				"windFarm",
				"seaLane",
				"trawlArea",
			}
		}

		return app.Save(tasks)
	}, func(app core.App) error {
		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		if taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField); ok {
			taskTypeField.Values = types.JSONArray[string]{"fishing", "construction"}
		}

		return app.Save(tasks)
	})
}
