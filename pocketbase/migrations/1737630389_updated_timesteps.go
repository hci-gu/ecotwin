package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("n6qz3c3tvyjlzmb")
		if err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("avr9foec")

		// remove
		collection.Fields.RemoveById("3bwmxqce")

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "jrew4lvq",
			"name": "index",
			"type": "number",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"noDecimal": false
			}
		}`)); err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "6ue9fbtk",
			"name": "data",
			"type": "json",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"maxSize": 2000000
			}
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("n6qz3c3tvyjlzmb")
		if err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "avr9foec",
			"name": "field",
			"type": "text",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"pattern": ""
			}
		}`)); err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "3bwmxqce",
			"name": "value",
			"type": "number",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"min": null,
				"max": null,
				"noDecimal": false
			}
		}`)); err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("jrew4lvq")

		// remove
		collection.Fields.RemoveById("6ue9fbtk")

		return app.Save(collection)
	})
}
