# Picknic recipe file format

Picknic imports and exports UTF-8 JSON files using the `picknic-recipe-v1` format. The file is a wrapper with a `format` identifier and a `recipe` object. The `recipe` object uses the editor's recipe draft fields: title, description, notes, servings, totalTimeMinutes, tags, imageUrl, visibility, ingredientComponents and instructionComponents. Ingredients retain name, quantity, unit, unitId and notes. Steps retain instruction, durationMinutes and advanceNotice.

Example:

```json
{
  "format": "picknic-recipe-v1",
  "recipe": {
    "title": "Lemon pasta",
    "description": "A quick weeknight pasta",
    "notes": "",
    "servings": 2,
    "totalTimeMinutes": 20,
    "tags": ["vegetarian"],
    "imageUrl": "",
    "visibility": "PRIVATE",
    "ingredientComponents": [{
      "name": "",
      "ingredients": [{ "name": "pasta", "quantity": 200, "unit": "g", "unitId": null, "notes": "" }]
    }],
    "instructionComponents": [{
      "name": "",
      "steps": [{ "instruction": "Boil the pasta.", "durationMinutes": 10, "advanceNotice": false }]
    }]
  }
}
```

Picknic's importer accepts this format only. It does not claim compatibility with Paprika, Mealie, or other recipe export formats. Imported data opens in the editor and must be reviewed and saved.
