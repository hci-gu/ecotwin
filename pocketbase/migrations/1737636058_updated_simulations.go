package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("ifbvnezf")

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "wqbwx8nd",
			"name": "options",
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
		collection, err := app.FindCollectionByNameOrId("0hdk5ehquq5qjpg")
		if err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "ifbvnezf",
			"name": "timesteps",
			"type": "relation",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"collectionId": "n6qz3c3tvyjlzmb",
				"cascadeDelete": true,
				"minSelect": null,
				"maxSelect": null,
				"displayFields": null
			}
		}`)); err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("wqbwx8nd")

		return app.Save(collection)
	})
}
