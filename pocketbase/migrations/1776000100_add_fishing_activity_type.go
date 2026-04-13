package migrations

import (
	"slices"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		tasks, err := app.FindCollectionByNameOrId("e0wjyih87n3o70n")
		if err != nil {
			return err
		}

		taskTypeField, ok := tasks.Fields.GetByName("type").(*core.SelectField)
		if !ok {
			return app.Save(tasks)
		}

		if !slices.Contains(taskTypeField.Values, "fishing") {
			taskTypeField.Values = append(taskTypeField.Values, "fishing")
		}

		return app.Save(tasks)
	}, func(app core.App) error {
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
			if value == "fishing" {
				continue
			}
			filtered = append(filtered, value)
		}
		taskTypeField.Values = filtered

		return app.Save(tasks)
	})
}
