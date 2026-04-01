package migrations

import (
	_ "embed"
	"encoding/json"
	"math"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

//go:embed prod_collections.json
var prodCollectionsJSON []byte

func init() {
	m.Register(func(app core.App) error {
		var collections []map[string]any
		if err := json.Unmarshal(prodCollectionsJSON, &collections); err != nil {
			return err
		}

		// The legacy PocketBase collections export uses:
		// - "schema" instead of "fields"
		// - field "options" objects instead of flattened field settings
		// - nulls for some numeric settings
		//
		// Normalize it to the current core.Collection JSON shape.
		for _, c := range collections {
			if t, _ := c["type"].(string); t == core.CollectionTypeAuth {
				// The legacy auth collection export options/indexes don't match the newer schema
				// (eg. username identityFields unique index requirements), so preserve whatever is
				// already configured in the target database.
				delete(c, "options")
				delete(c, "indexes")
			}

			rawSchema, ok := c["schema"]
			if !ok {
				continue
			}

			rawFields, ok := rawSchema.([]any)
			if !ok {
				continue
			}

			fields := make([]any, 0, len(rawFields))
			for _, rf := range rawFields {
				f, ok := rf.(map[string]any)
				if !ok {
					continue
				}
				fields = append(fields, normalizeLegacyField(f))
			}

			c["fields"] = fields
			delete(c, "schema")
		}

		raw, err := json.Marshal(collections)
		if err != nil {
			return err
		}

		// Don't delete missing collections/fields to avoid accidental data loss.
		return app.ImportCollectionsByMarshaledJSON(raw, false)
	}, func(app core.App) error {
		return nil
	})
}

func normalizeLegacyField(legacy map[string]any) map[string]any {
	out := map[string]any{}

	// copy everything except "options" (handled below) and legacy-only flags
	for k, v := range legacy {
		switch k {
		case "options", "unique":
			continue
		default:
			out[k] = v
		}
	}

	// merge legacy options into the root (new field JSON shape)
	if opt, ok := legacy["options"].(map[string]any); ok && opt != nil {
		for k, v := range opt {
			// don't override explicitly set root keys
			if _, exists := out[k]; exists {
				continue
			}
			out[k] = v
		}
	}

	fieldType, _ := out["type"].(string)

	switch fieldType {
	case "text":
		// legacy: min/max could be null (new: int)
		if out["min"] == nil {
			out["min"] = 0
		}
		if out["max"] == nil {
			out["max"] = 0
		}

	case "number":
		// legacy: noDecimal (new: onlyInt)
		if v, ok := out["noDecimal"]; ok {
			out["onlyInt"] = v
			delete(out, "noDecimal")
		}

	case "relation":
		// legacy: minSelect/maxSelect could be null (new: int)
		if out["minSelect"] == nil {
			out["minSelect"] = 0
		}

		// legacy: null maxSelect meant "multiple (no max)".
		// PocketBase internally represents it as max int.
		if out["maxSelect"] == nil {
			out["maxSelect"] = math.MaxInt32
		}

		// legacy-only
		delete(out, "displayFields")

	case "file":
		// legacy: maxSelect/maxSize could be missing/null (new: int/int64)
		if out["maxSelect"] == nil {
			out["maxSelect"] = 1
		}

	case "select":
		// legacy: maxSelect could be missing/null (new: int)
		if out["maxSelect"] == nil {
			out["maxSelect"] = 1
		}
	}

	return out
}
