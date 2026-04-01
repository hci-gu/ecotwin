package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(3, []byte(`{
			"hidden": false,
			"id": "date2990389176",
			"max": "",
			"min": "",
			"name": "created",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		// add field
		if err := collection.Fields.AddMarshaledJSONAt(4, []byte(`{
			"hidden": false,
			"id": "date3332085495",
			"max": "",
			"min": "",
			"name": "updated",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "date"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("wcn8r2gz6f2psy5")
		if err != nil {
			return err
		}

		// remove field
		collection.Fields.RemoveById("date2990389176")

		// remove field
		collection.Fields.RemoveById("date3332085495")

		return app.Save(collection)
	})
}
