package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ewi0x38j6dujau8")
		if err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "0lf3xjtm",
			"name": "oceanData",
			"type": "relation",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"collectionId": "e8mjtte6qsg23nj",
				"cascadeDelete": false,
				"minSelect": null,
				"maxSelect": 1,
				"displayFields": null
			}
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ewi0x38j6dujau8")
		if err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("0lf3xjtm")

		return app.Save(collection)
	})
}
