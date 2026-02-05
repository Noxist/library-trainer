# Data files for GitHub Pages

Upload all JSON source files to this folder in the repository:

- `public/data/roomDistanceMatrix.json`
- `public/data/YYYY-MM-DD_ml.json` (all day files)
- `public/data/dataset-index.json` (list of day files)

`dataset-index.json` must include every day filename, for example:

```json
{
  "matrixFile": "roomDistanceMatrix.json",
  "dayFiles": [
    "2026-01-03_ml.json",
    "2026-01-04_ml.json"
  ]
}
```
