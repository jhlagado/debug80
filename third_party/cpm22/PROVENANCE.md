# CP/M 2.2 guest sources

The CCP and BDOS sources in this directory come from
[brouhaha/cpm22](https://github.com/brouhaha/cpm22) at commit
`01018abbccce0bdf4874b0b2ed1a048c5fcc2987`.

The upstream files are distributed under the terms in
[LICENSE.txt](LICENSE.txt). They remain separately licensed third-party
material; their inclusion does not change their license to Debug80's GPL
license.

For stable cross-platform builds, Debug80 stores the assembly sources with LF
line endings. No source text was otherwise changed.

Documentation-only adjustment: `README.upstream.md` replaces the upstream
CI badge image, which returns HTTP 404, with a text link to the same workflow.
The assembly sources and licence text are unaffected.

| File          | Upstream SHA-256                                                   | Repository SHA-256                                                 |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `ccp.asm`     | `015dc5754a911c48eb50bbb6ec97bd170be39d000da9409f4064594782e9b5c3` | `497aea556887cbae6f2fc54f24b9826fcd17950f1534f9e54d9b67de094949bc` |
| `bdos.asm`    | `2f715ad880257a4beee802d8fd9c38ec132fdeaf26b8bc4e391a324df072ad99` | `7aaea6a0bc42cfc38f5b18c20885cdd65c6f059ad7994f654e78f760d362bfcc` |
| `LICENSE.txt` | `a9bcdbc66bb31b86882e84469f133b3bd5598f46423b4c6bbb6bedb9f2eac754` | `a9bcdbc66bb31b86882e84469f133b3bd5598f46423b4c6bbb6bedb9f2eac754` |

Debug80 mechanically translates the Intel 8080 mnemonics into Zilog syntax at
build time. The translation deliberately preserves the original instruction
selection and emitted bytes.
