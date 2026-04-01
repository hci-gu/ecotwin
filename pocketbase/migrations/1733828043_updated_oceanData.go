package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e8mjtte6qsg23nj")
		if err != nil {
			return err
		}

		// add
		if err := collection.Fields.AddMarshaledJSON([]byte(`{
			"system": false,
			"id": "5ols6ncn",
			"name": "depth",
			"type": "file",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"mimeTypes": [],
				"thumbs": [],
				"maxSelect": 1,
				"maxSize": 5242880,
				"protected": false
			}
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e8mjtte6qsg23nj")
		if err != nil {
			return err
		}

		// remove
		collection.Fields.RemoveById("5ols6ncn")

		return app.Save(collection)
	})
}
