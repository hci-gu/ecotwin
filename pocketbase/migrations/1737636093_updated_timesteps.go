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

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "gymw51lz",
			"name": "simulation",
			"type": "relation",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"collectionId": "0hdk5ehquq5qjpg",
				"cascadeDelete": true,
				"minSelect": null,
				"maxSelect": 1,
				"displayFields": null
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

		// remove
		collection.Fields.RemoveById("gymw51lz")

		return app.Save(collection)
	})
}
