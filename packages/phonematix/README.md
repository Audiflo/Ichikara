# Phonematix

Phonematix is a TypeScript phoneme conversion library for singing-synth projects. Notation adapters convert through normalized IPA segments, so a symbol only needs one mapping into the intermediate form. It supports VOCALOID Sampa, ARPAbet, and IPA.

The library is used by Ichikara's English renderer to expand imported phoneme aliases such as `kh`, `aI`, and `I@` before synthesis.

## Library

```typescript
import { convert, detectNotation, ARPABET, VOCALOID_SAMPA } from "@audiflo/phonematix";

convert(["kh", "Q", "aI"], { from: VOCALOID_SAMPA, to: ARPABET });
// ["K", "AA", "AY"]

detectNotation(["kh", "aI"]);
// "vocaloid-sampa"
```

`convert` accepts a string or an array of symbols. ARPAbet input accepts lowercase aliases and stress markers such as `AH0`. VOCALOID Sampa input is case-sensitive because `D` and `d`, `S` and `s`, and `T` and `t` are different phonemes. Unknown symbols throw `UnknownPhonemeError`; unknown notation ids throw `UnknownNotationError`.

The bundled notations are:

- `vocaloid-sampa`: English VOCALOID Sampa aliases from the [ARPAsing phoneme chart](https://arpasing.tubs.wtf/en/resources/phoneme-chart).
- `arpabet`: ARPAbet symbols used by CMUDict and the Ichikara English renderer.
- `ipa`: normalized IPA segments. This notation is generated from the other adapters.

IPA is stored as segment arrays rather than a raw string. Diphthongs and affricates are sequences of segments, so `aI` and `AY` both become `[a, ɪ]`. Silence uses `∅` internally.

## Extending

An adapter contains two tables: `toIpa` maps source symbols to IPA segments, and `fromIpa` maps IPA segment sequences back to symbols. Custom adapters can be added at runtime without changing the package:

```typescript
import { convert, createRegistry } from "@audiflo/phonematix";

const registry = createRegistry().extend({
  id: "example",
  toIpa: { zz: ["z"] },
  fromIpa: { z: "zz" },
});

convert("zz", { from: "example", to: "arpabet", registry });
// ["Z"]
```

`createRegistry()` returns an isolated registry. Extending one does not mutate the default registry used when `convert` has no `registry` option.

UTAU aliases, VCCV, and Japanese kana are not bundled. They are sample-set conventions rather than a single phoneme notation, so they belong in adapters that map their aliases into the same IPA segments.

## Development

From the repository root:

```sh
npm run build -w @audiflo/phonematix
npm test -w @audiflo/phonematix
npm run typecheck -w @audiflo/phonematix
```

`npm run build` uses tsdown and emits ESM, CJS, source maps, and declarations.

## License

MIT. See [LICENSE](LICENSE).
