# Image Auto Transpose Module

UnoWorship image score auto-transpose module.

This folder is reserved for the future image/PDF score recognition pipeline.
It must stay separate from the current text-based `contiFlowAnalyzer` and
`chordTransposer` modules because image score transposition is an engine-level
feature, not only a worship-conti page feature.

## Module Boundaries

- `adapters/`
  External OMR/OCR engine adapters. Examples: Audiveris, commercial OMR API,
  local worker, or future in-house recognizer.
- `pipeline/`
  Upload -> analysis request -> recognition -> review-ready model -> generation
  orchestration.
- `review/`
  Human review data model. The automatic result should be editable before
  transposition is considered final.
- `transpose/`
  Music-data transposition. This should operate on structured score data, not
  raw pixels.
- `render/`
  MusicXML/PDF/PNG/tablet/mobile score rendering.
- `storage/`
  Original asset, analysis result, generated asset, and copyright metadata
  persistence boundaries.
- `jobs/`
  Long-running/background job contracts for OMR and rendering.
- `fixtures/`
  Test-only sample assets. Do not place copyrighted hymn, score, or song files
  here.

## First Rule

Raw image pixels are not directly transposed. A source image must first be
converted into reviewable structured score data, then transposed, then rendered
again as a new score output.
