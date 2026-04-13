package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		plans, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		if plans.Fields.GetByName("tile") == nil {
			if err := plans.Fields.AddMarshaledJSON([]byte(`{
				"cascadeDelete": false,
				"collectionId": "ewi0x38j6dujau8",
				"displayFields": ["name"],
				"hidden": false,
				"id": "relplantile",
				"maxSelect": 1,
				"minSelect": null,
				"name": "tile",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "relation"
			}`)); err != nil {
				return err
			}
		}

		return app.Save(plans)
	}, func(app core.App) error {
		plans, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		plans.Fields.RemoveById("relplantile")

		return app.Save(plans)
	})
}
