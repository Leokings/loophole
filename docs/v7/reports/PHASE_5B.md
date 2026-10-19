# Phase 5B report — live StudioNet V7 demo

## Summary

The fourth V7 world completed all 11 scenario stages through r10 fallback. The saved scenario contains 119 transactions: FINALIZED_EXPECTED_FAILURE / ERROR: 5, FINALIZED_SUCCESS / SUCCESS: 114. The proof manifest was assembled locally and the read-only verifier now passes against StudioNet for 126 unique deployment/setup/scenario transactions, all three application contract source digests, the probe source digest, and five case links.

GitHub run 39221192010 is still marked failed because its older verifier rejected a finalized Republic deployment whose decoded calldata was absent. The live scenario itself completed; this report’s local verification reran no demo steps and sent no transactions.

## Work packages

| WP | Status | Result |
| --- | --- | --- |
| D3 | done | The StudioNet scenario completed all 11 stages and recorded 119 finalized receipts. |
| D4 | done | The receipt verifier fallback is covered by tests; the proof manifest was assembled and verified read-only against StudioNet. |
| D5 | partial | Final storage counters were read after r10. The API returned counts but no byte-size/per-write-cost data, so writes-per-day and deletion savings could not be measured. |
| D6 | partial | This report and the proof artifacts are ready in the repository. Hosting and Portal updates were left untouched as requested. |

## Release and deployed code

- Release record: deployments/studionet-2026-10-18T18-09-40.367Z.json
- Scenario source commit: 8c085efd52a95891f5463b1bf3fd1dcd21c2373d
- Resume runner commit: c1e6f191aca8cda5f7a9ff4047cd784fcbb82e7f; the checkpoint contract source commit remained 8c085efd52a95891f5463b1bf3fd1dcd21c2373d.
- Network / chain: studionet / 61999; RPC read-back and transaction receipts came from StudioNet.
- Toolchain: genlayer-js 1.1.8, Node v22.23.3; runner dependency py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6; runner header sha256 d4654f0c2109340179260edfbfa2751588380de86100acbe23c641572b88cf6d.
- Constructor timing: commit 1200 s, reveal 600 s, brief 600 s, court resolution / judgment / fallback grace 10800 / 10800 / 10800 s, keeper slot 900 s, season length 12 rounds. The live release used a 1,200-second commit window; the scenario revision specifies 600 seconds, so this timing difference is recorded as a deviation.
- Probe: 0xF011431e1e8adca9413024c277Cc3F17f5bb8644, source sha256 c888103d9b576d192de6d8f85fa94573052f4da1d138806461bb75f60669855f.

| Contract | Deployed address | On-chain source sha256 | Deployment transaction |
| --- | --- | --- | --- |
| republic | 0x7E3304b9D21Aa7071697F39Db3743828C39f4681 | 9c45f06234ac684d92f318d0cf1715dd6e4ea4993b31b9daa38cf51ee13c44fd | 0xc6d33e2379086a36ca80d1e385120309ee52aaf2f7fd514063ffc31657b5e17a |
| caseLaw | 0xE612FF66Ee8a019ccdeC5F6E28e1a8aBF39FBDEf | 091cdcdb5596cd9ed8bec4fecb7912fb410f7d077e34dd0c729cf7c3518f6d50 | 0x38766d4242dd5da5c364cde77f32fdfac36d612571bda5b06723fcba81ee7536 |
| court | 0xB055d688A2c48317eD4E40086dDF734b80B3d561 | 3774be8c3ee0b1bb49c1277512ae1c7aa0dd6da87a63578f4386d1643b57b913 | 0x5a68b6159f54b35f45f028ff454d540cf31bd97aacf281efdf7782fe6a37314c |

The verifier fetched deployed code and matched every listed source sha256. It also checked the probe source digest. Contract source files were not changed by this verifier fix.

## Transaction ledger

Every row below records the proof manifest’s status, execution result, and consensus result. The verifier independently checked each unique transaction receipt was FINALIZED, matched the expected recipient and method (using GenVM readable calldata only when the SDK decoder omitted it), and passed the expected-success / expected-failure checks. Five case links were also validated; mutable historical read-backs are not re-queried by the verifier.

### Deployment and setup transactions

| Record | Method | Transaction hash | Status | Execution | Consensus |
| --- | --- | --- | --- | --- | --- |
| deploy-republic | deploy | 0xc6d33e2379086a36ca80d1e385120309ee52aaf2f7fd514063ffc31657b5e17a | FINALIZED_SUCCESS | SUCCESS | AGREE |
| deploy-caseLaw | deploy | 0x38766d4242dd5da5c364cde77f32fdfac36d612571bda5b06723fcba81ee7536 | FINALIZED_SUCCESS | SUCCESS | AGREE |
| deploy-court | deploy | 0x5a68b6159f54b35f45f028ff454d540cf31bd97aacf281efdf7782fe6a37314c | FINALIZED_SUCCESS | SUCCESS | AGREE |
| probe.deploy | deploy | 0x0027fd6faebd8ffc152707450bf1d76bd9086f4286e917f5655c98da7f4e2012 | FINALIZED_SUCCESS | SUCCESS | AGREE |
| probe.write | write_probe | 0x5fd8ee558a949ae2a244d75b33a15d905406f07b061428d6962069eb38f987c2 | FINALIZED_SUCCESS | SUCCESS | AGREE |
| republic.set_links | set_links | 0xdbfd04abe5218ee5f96a72c8e2f917bf910b4d365703cdbaa567e4745eefd073 | FINALIZED_SUCCESS | SUCCESS | AGREE |
| caseLaw.set_court | set_court | 0xcede0bd4ce70689abcc966de4b4b0ea58c217750fc87297f6dbe6143febda37e | FINALIZED_SUCCESS | SUCCESS | AGREE |

### Scenario transactions

The 119 rows include the four seat claims, all round commit/reveal/advance operations, law certification, crisis operations, court filings and rulings, finality guards, seat releases, and the r10 fallback advance.

| Record | Method | Transaction hash | Status | Execution | Consensus |
| --- | --- | --- | --- | --- | --- |
| claim:MERCHANTS | claim_faction | 0x90fe943ab14ca99a057d621ac13ed89bdf273804f0853aa7252374569244d728 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| claim:REFORMERS | claim_faction | 0xdaf0fab8f66d0c9393e203d0b788fc0725b43de5b7ddc95bdf118b11e649f417 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| claim:TRADITIONALISTS | claim_faction | 0x3c8f88eade94056c5fa29be5e270973771fba9dffbdad32b158593115cf146ae | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| claim:REVOLUTIONARIES | claim_faction | 0x9eb34c537db4f5a093bdda55a08721af629db3debd0f2f34ca1f6b7ccd9293f0 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:commit:MERCHANTS | commit_action | 0xf8111cf88a56fdfc15812441353b29bdd00cd895c922dc0c5f12cb433a62f0be | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:commit:REFORMERS | commit_action | 0x8fa642cb0195eb5ac7cd02b9a4bdb818c44cba08825d4ab698966dd204aece1c | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:commit:TRADITIONALISTS | commit_action | 0x0c97591f1583df2dda3674cc4ec32933b832212383e5b0bc02b62df0ed7737e1 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:commit:REVOLUTIONARIES | commit_action | 0x88c617137d8f614ba845e650cad0a766395222f255c11a9af4cdad0b27c20478 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:reveal:MERCHANTS | reveal_action | 0x664110204082c8ac02499728b08b33ec125fe9fb37956f1f3ef79d7ae961a8a8 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:reveal:REFORMERS | reveal_action | 0x41da8ba4b5d50e9228928056f748ad9d86ee734983dde720e606dfe234dfa068 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:reveal:TRADITIONALISTS | reveal_action | 0x3b6c49749d750d513e34521f394f5c0b27249e1f6d376c740bb27b3611638c70 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:reveal:REVOLUTIONARIES | reveal_action | 0x6fe4e22ac30b71ab1f32f174279370ddd1ec24c98d0d68333bbd657b8b0fc316 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r1:advance | advance_round | 0xdd051818484ab2a5a0a96774c0cf4c73794ef96f5318b022d70576fd151dee24 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:commit:MERCHANTS | commit_action | 0xdb044fdccaa80d174db7af094ff5937436a067810956b9c190755f89d9ff5a02 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:commit:REFORMERS | commit_action | 0x660a8b82ade6f46e0e888a95da82b78ea3468743fca3ae7686e71cb2c4ca5006 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:commit:TRADITIONALISTS | commit_action | 0x3ccf3a2c06f6929bbe11c5758ba0fda05bf80c7349a809488e9918ac8e1d8d24 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:commit:REVOLUTIONARIES | commit_action | 0x840f279632889c109369e5c5beada3c5d73c8427e9f078d7d037bfc079a11e37 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:reveal:MERCHANTS | reveal_action | 0xf9e1aaf8350904f7a8728d26e4a7cb268c08d73e46e183ea2d45733a6a54aa93 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:reveal:REFORMERS | reveal_action | 0x237224bea84484254386fcd3ed513ed033fb54e66ba1d098ee07d8a561524bd4 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:reveal:TRADITIONALISTS | reveal_action | 0xff787eacc7b6731abaef9a8e5cb55fcfd9ae7dddafd91e190875cb626db2379c | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:reveal:REVOLUTIONARIES | reveal_action | 0xc9927d9338bcbcbb50d17ad3da5eae1dd683f0dc2358321410206df36271032c | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| certify:vague | certify_law | 0xb9b8c9481a21410d95f5c001834c9a51f361a6bb330081719cfc2fb0fb340a24 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| certify:rule | certify_law | 0x19804d74c65d3c7a532f14a333f05a936f765c8cc82c90384daad2a833fd8663 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r2:fallback-too-early | advance_round_fallback | 0x43cb9c929492239e79c1b1439be17893c2095396822ba53d3c2aeeb49d50c0f5 | FINALIZED_EXPECTED_FAILURE | ERROR | MAJORITY_AGREE |
| r2:advance | advance_round | 0x43f285a8e874a7310c5f5b71413b415c9bb20ff0d6ea5f1e88a9b3f3262d8062 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:commit:MERCHANTS | commit_action | 0x97709dca86cd18ecdf9fc4275800aad0d77503d991e8a74f20e64cf4eb332ff7 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:commit:REFORMERS | commit_action | 0x1d24c9a1b2c67d96a81ec9e8a6b94e42822cee8789f2755d57d46c119f2138c3 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:commit:TRADITIONALISTS | commit_action | 0x0176161612bd11a4bcf3c4e46f33af1320b3b3e04d4c5d0788e16c6f3e75bf22 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:commit:REVOLUTIONARIES | commit_action | 0x26d5e7973fa67bed99502d966668fbd4c4e01e04e3aa0ec71b342ac2cf8b717f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:reveal:MERCHANTS | reveal_action | 0xc25c590550bf3abec3e5bcd4bd2597b5e4a5d25101890c07c4f63faf55d8115e | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:reveal:REFORMERS | reveal_action | 0x41dae22c2aee9947c8b7635aa27a82b77b18f320a76eb936d2e6bdb665b9fb21 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:reveal:TRADITIONALISTS | reveal_action | 0x743e994abd01ee021d31cfa5e1cb2b1e3ca14cb73d79e4eb69b4ea65fa8cd8e6 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:reveal:REVOLUTIONARIES | reveal_action | 0x9b3c6b5a2e448128c8274704660eee39b34eab6df6ca004a0e9148ef7996b676 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r3:advance | advance_round | 0x86195c4119fa6bdba9528fb97bfb9b79192503a9e706bc8bc3cb42191ee728fd | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:commit:MERCHANTS | commit_action | 0x3dc83ca82426b458e80ebd891748ce8915d70454916150db7b129cc387e048d6 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:commit:REFORMERS | commit_action | 0xae457023c7600b92ae44869df68106fb0f56ba0b2506007f14e33b38f1396414 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:commit:TRADITIONALISTS | commit_action | 0x65a6f318d35d3801b2abcf76f51a153b25d3081710e2d70678a80fab2675335d | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:commit:REVOLUTIONARIES | commit_action | 0x87dd51451c9d88251d83c22e6c8e7a5f9bb1d2c9f7c2f66014171c2fef40e7ce | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:reveal:MERCHANTS | reveal_action | 0x836185cf0681dd4cfd39b31f1f41c96d9dd4f01ebb83fea78f9a22892b59d40f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:reveal:REFORMERS | reveal_action | 0xaa679f0915b8fd95df7de354597d45cf93fb3e0a9992ca1aae92b1c051161a94 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:reveal:TRADITIONALISTS | reveal_action | 0x817a7bfa22edf81a1f7f198872780db09c2d32ae983177c4e072a6ed4f669dbd | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:reveal:REVOLUTIONARIES | reveal_action | 0xa5125a610084fdb95f0097a157d65b93c202b05b0195eb81f9503a6b17af9808 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| crisis:open | open_crisis | 0x6266e2fe650472f6925b177472eca4a962f98e8986b6ec93ca3714f4be45c6ae | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r4:advance | advance_round | 0x9b588fe871d863c6913e1e78d3dc76997e9e553b3d98f9f9f1e04495ab8a73d1 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:commit:MERCHANTS | commit_action | 0x48619fc00f208c1c6d910fce28f3c2de6992fd22eecf4619bc61c7306b389c0e | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:commit:REFORMERS | commit_action | 0xdcef25e23cd49b94093981d1a2665bbab4d7d0fa8b782d07c2e973c98d0f2b15 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:commit:TRADITIONALISTS | commit_action | 0xcdc920376b1b632c9f6739b1c4fe955d98bba826486b94a0cde2cd1e4cc171bf | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:commit:REVOLUTIONARIES | commit_action | 0x23992b1cdd1bc4a4f036e56fc17cd55dba17c5582e4eb43dbe353f12a30dfc21 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:reveal:MERCHANTS | reveal_action | 0x9050d58522951b8d8377be5b969ab8613843b24c50171b08d80f6bbaa78eb4fd | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:reveal:REFORMERS | reveal_action | 0x6ba21623948c66af026d699c247e1ca0a037332ec3e22318177ebcefdf2a0d2f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:reveal:TRADITIONALISTS | reveal_action | 0x2415cbc9f351cfb78888d25cd72815fbba6fe56260d3dea8104df685056cefa3 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:reveal:REVOLUTIONARIES | reveal_action | 0xdc0c0f0eff368ec0f151d3b21eccbd7561dfba6d163fc5e721aa413f34e46169 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r5:advance | advance_round | 0xe2a1d83b8d99f3597afe4e21765bc5e979dc1cce048694502a942b45bc3466ec | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:commit:MERCHANTS | commit_action | 0xa2c94f42b2a6d4c7a9fd311f802864a542e192c3dee2b9fb6f97bc3fcf6ae236 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:commit:REFORMERS | commit_action | 0x07bae4f4a4b82b0807b108361d185750a8f22a1b87965bbe800c133191ebb52b | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:commit:TRADITIONALISTS | commit_action | 0x3b78f7020e0bbc1a3e93cbc2e0c02c513e5024d8cdebdca0d82d4605646965f4 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:commit:REVOLUTIONARIES | commit_action | 0x5e86cf06c63d6f7beaa8b3ec20da2d1e558f8528b5c6f45ceb95a44113735bac | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:reveal:MERCHANTS | reveal_action | 0x3ac91475acb3cdd8e9d1d28ae5f8c4208ac83b3b54109ed6a6e3918d6ab84eab | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:reveal:REFORMERS | reveal_action | 0x901aec3050c6182f55e03d297f2c07ab7c417fc825cc14e24f30184ec5126280 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:reveal:TRADITIONALISTS | reveal_action | 0x8db7eb8a282e8b1900e5bf34e242eda3ed1362e552d1f6345efd8ae370c013d2 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:reveal:REVOLUTIONARIES | reveal_action | 0x5a2f51870006266ab716840a05e46833d5d461556d0bc93e9713051d5702e190 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| crisis:judge | judge_crisis_response | 0x1cf77ac2c2d1bee51f0ee140b020237b5795dada40cfa5ca401d2926a5cfd74a | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| crisis:close | close_crisis | 0xd0d6b4cdde7983b0717669c0e14a576872b710117188c5e44b1aab76c0d2d77f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:A:file | file_case | 0x6d79ea524e6a10d79686d2cbe02fddf8089c0e0319a86c93552f193439d05246 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:A:plaintiff-brief | submit_brief | 0xa0fabd1cb3f0d6c2f6ecf7f8712817051460ccdd34b5bfab13992d898fa35845 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:A:defense-brief | submit_brief | 0x8638c844bbb3d331748d49bcdafaf1b9c2222b914681572aa88bbdd6b95ab5f3 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:B:file | file_case | 0xebd844e08aedb725fc37ea5469a42c6c3934c562131a4ea505e707bd74c13577 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:B:plaintiff-brief | submit_brief | 0x5575c03171b5f015e5a2fc5db7c7cd8689d241eba85943216571250bba083386 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:B:defense-brief | submit_brief | 0x560c737b9247a405e45a6d57372b0b89fe4cf8e57b4d12f880c535f97459453a | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:C:file | file_case | 0x650e90a3c064d85bbc2f49103f3d70ca3355723ec92ebafa2eff80cc3c566143 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:C:plaintiff-brief | submit_brief | 0x8446cf7e6eb98ec7690fc2bc85a7b9e0abf49d9ed7a937b853b80779ca73651b | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:C:defense-brief | submit_brief | 0xa0d1e3c07e0632d8d947dc9e2a06a10b79eabf61cf35df076d43411445558574 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:A-prime:file | file_case | 0x2145d964296c7b5c5ac87c875f026ea072368db330dbe4fdf97ec784cbc6cf1d | FINALIZED_EXPECTED_FAILURE | ERROR | MAJORITY_AGREE |
| case:A:resolve | resolve_case | 0x5b126cbf0b20d4502aecbf91733b6019e596464349b07b8e509067f5839d2636 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:B:resolve | resolve_case | 0x6c4032acafa47048756f845e90e48e7643fcb05a7409301ddb125ff478166984 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:C:resolve | resolve_case | 0x96048fe05063d9bc39187a73e5fdbba8fb3ac7f86e7d90750661d87cc422692e | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r6:advance | advance_round | 0x3f64fe4b28984e64f80e77e23fffdaf2d75ee9965bef1079fc574ca2c54364bc | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:commit:MERCHANTS | commit_action | 0x6c46f3834c1318cd13f53a485f8d74ff5148453218b65b8504e2f35c26e46964 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:commit:REFORMERS | commit_action | 0x4c8adf0b1ffe2d62b4beb21be9410f79d0c599694c08c30c98435a594b85d968 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:commit:TRADITIONALISTS | commit_action | 0x7ec29700dc1aef84da6e8dad18e8c8d737d24237a790c31df275c3a763e91b71 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:commit:REVOLUTIONARIES | commit_action | 0x76f302eec966cf1f17e062cf075535acaff8fe710f9b0be328814cabb2c06511 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:reveal:MERCHANTS | reveal_action | 0x83ab0137edb2fa339ba90510815b84415e16350f76857672dc5091ee306bb3fc | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:reveal:REFORMERS | reveal_action | 0x0b21fc5e2385a65b73b6bac409c20148e7b8349d659dc03c5496cbe5bdd5bbfc | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:reveal:TRADITIONALISTS | reveal_action | 0x2a21300682bafe3d997323e1adb3ff46ea110e214861703c98f8dc10a39c1a2a | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:reveal:REVOLUTIONARIES | reveal_action | 0xdae8add9e1c07a0c9ad1030a0e6954c8e1b4adf493df7b009db7fd703e2e47ff | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| certify:v2 | certify_law | 0x1ed282be3b8ef0c6a05d271e41c3ca9eff96e68297e885e15c547719e3d58515 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:D:file | file_case | 0xd11ca6ccf0268abe82d8c81cd92ee527cc4ecf56fde270eb111c4b44ee13e931 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| guard:file-case-from-republic | file_case_from_republic | 0x60efbf4b87f8d9a9d6c84b54a51a47ce7ffed441ceccbb6a41f1df406e39e8e8 | FINALIZED_EXPECTED_FAILURE | ERROR | MAJORITY_AGREE |
| guard:record-holding | record_holding | 0x789cdeccb7aae2d81d2beb605dfe59ea81f11a1a62496498df28b65a68da1aee | FINALIZED_EXPECTED_FAILURE | ERROR | MAJORITY_AGREE |
| guard:recover-effects | recover_case_effects | 0xaa2e4d5f324d41908ad4ee0a7c394486c4524ab260b3c47752dc4a4b422cb0bb | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r7:advance | advance_round | 0x2db475d32e20ff4b23ee211d3756a7b685bf5639e534a6e4786a4a25cab7792e | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:commit:MERCHANTS | commit_action | 0xf001d0276d6bb6d053aea41801d342f575e06e6efaf642a9e5bb926364975cf2 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:commit:REFORMERS | commit_action | 0x378c128812058d8665c6019cc5810a694f2f0a9590480ad50fdef7f4ed5de57a | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:commit:TRADITIONALISTS | commit_action | 0x2db54aba3071fff64bc48380d83ee7bbcb1df633b8604ac72fe0ade3d74821a9 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:commit:REVOLUTIONARIES | commit_action | 0x504ad2a0ff8778b8f414ca458c0f459b0bd65656e4ef482ee4b74660ae69b119 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:reveal:MERCHANTS | reveal_action | 0x00914aa9a7bf5379b1e25d345f1ce9a238ad64aae86853ff6d6169b6ea76ae54 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:reveal:REFORMERS | reveal_action | 0x977e440a30fc912b272ca1e720efa387e49879831db3360b46399f62e5b3dfc8 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:reveal:TRADITIONALISTS | reveal_action | 0x3e6d1244c14ad1b8dff173817ead1639c5d8e9062d79033819327975b59be1e1 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:reveal:REVOLUTIONARIES | reveal_action | 0x56e1f331e82e0f02ee23fdd1d3a2986ca4a831721823f2265c12a21d42d8596f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r8:advance | advance_round | 0x01d8b40ea9a47d67facab7adf071b70bbce6ffbf5b63e3b5648146948b0b4973 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:commit:MERCHANTS | commit_action | 0x9c95793c1ef46d4f344b738c8ba9f716904f56314cfaff96fc1ff588a7c51733 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:commit:REFORMERS | commit_action | 0xc1a2e8055a327470da4cdfbcdefb9b87092a92958a37ea5eed6598c4a8c051bc | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:commit:TRADITIONALISTS | commit_action | 0xbfa2001cd2e12db511a1aca84ef5d30fd77a29f7413093a6f7bbba75202b7d57 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:commit:REVOLUTIONARIES | commit_action | 0x486ba51aba075699ebbc5de54cf390a1c45bb13c58cb73f0972d474bc39bad34 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:reveal:MERCHANTS | reveal_action | 0x9bca5a5bf209d5964e019adea6923949339a0c32147db3dc1e3c364ab16b2b7e | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:reveal:REFORMERS | reveal_action | 0x0990555287ddd35ba7a17d164672c486bdc951fb02d25dca2a4e55da9c38edd8 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:reveal:TRADITIONALISTS | reveal_action | 0x517fd56cfdddce961b00eb5e8cd0b46efd7a5e6bea0c174ffa5131d929ba175f | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:reveal:REVOLUTIONARIES | reveal_action | 0x8eff77766a742977eda728eb6e550a74b9eec36400da9960d94291b16de7fa70 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r9:advance | advance_round | 0xcd47d827b3a28d65317b2a30ee13396ac45321003110f397e6752e6c35921d86 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:E:file | file_case | 0x1032d444476414ed88b5cb9e54d48a652c90f2cbc5f474db7fa5d1b7cd333666 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:E:plaintiff-brief | submit_brief | 0x42d0f6e3904d217a572d71d0aa944b374965d338a7e3e20e8e60ca5667b7f6aa | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:E:defense-brief | submit_brief | 0x8ee28870493205467264541fe6dd80570c2d0ec2961cdb66975303dc12efc551 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:E:resolve | resolve_case | 0x905c4a0f1b36e44e167a01e04b9798ca534d62cbc3d5537c4066f7e97b0d6b5d | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| case:E-prime:file | file_case | 0x475cbcdce8d8bf7d21439e6afbc3125c977e729eed9b5066a856b6f26f3531d2 | FINALIZED_EXPECTED_FAILURE | ERROR | MAJORITY_AGREE |
| r10:release:MERCHANTS | release_faction | 0x52d523ad1fe8bdade2740890a48fde24d6c67937136eefad5d71bfb2391eef82 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r10:release:REFORMERS | release_faction | 0x558721bbfafc957e35e505a50d3d3e1221bccca69f78b416e7943e755da29945 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r10:release:TRADITIONALISTS | release_faction | 0x2f1e553a87713e8628b9e22fa1c5178c472d1e8c24088c4123f6d7f479728672 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r10:release:REVOLUTIONARIES | release_faction | 0x33adcc95d74978165a014655d99a31193579f35d2f344e8fdf89da36cd7957d6 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |
| r10:fallback | advance_round_fallback | 0xef0dc04d76e66059c868dea5ce06ee2f323e44913e03bc33b5f385302ee14a85 | FINALIZED_SUCCESS | SUCCESS | MAJORITY_AGREE |

The five finalized execution errors were all recorded as expected failures:

- r2:fallback-too-early: FALLBACK_NOT_READY — 0x43cb9c929492239e79c1b1439be17893c2095396822ba53d3c2aeeb49d50c0f5
- case:A-prime:file: CASE_CLAIM_DUPLICATE — 0x2145d964296c7b5c5ac87c875f026ea072368db330dbe4fdf97ec784cbc6cf1d
- guard:file-case-from-republic: REPUBLIC_ONLY — 0x60efbf4b87f8d9a9d6c84b54a51a47ce7ffed441ceccbb6a41f1df406e39e8e8
- guard:record-holding: COURT_ONLY — 0x789cdeccb7aae2d81d2beb605dfe59ea81f11a1a62496498df28b65a68da1aee
- case:E-prime:file: CITED_LAW_NOT_EFFECTIVE — 0x475cbcdce8d8bf7d21439e6afbc3125c977e729eed9b5066a856b6f26f3531d2

The r10 fallback transaction returned round 10. Its recorded round summary contains four actions, each marked AI_FALLBACK. The scenario state records the full 11-stage order: claims, r1 through r9, then r10_fallback.

## Case outcomes and finality callbacks

| Case | Label / disposition | Verdict | Sanction | Verbatim quote | multi_emit_delivered |
| --- | --- | --- | --- | --- | --- |
| 1 (A) | NOT_COVERED | NO_VIOLATION | NONE | “No faction may UNDERMINE a faction that holds public office.” | true |
| 2 (B) | COVERED_BREACH | VIOLATION | REPRIMAND | “No faction may UNDERMINE a faction that holds public office.” | true |
| 3 (C, prompt-injection claim) | NOT_COVERED | NO_VIOLATION | NONE | “No faction may UNDERMINE a faction that holds public office.” | true |
| 4 (D, summary at filing) | SUMMARY; inherits case 1 holding NOT_COVERED | NO_VIOLATION | NONE | “No faction may UNDERMINE a faction that holds public office.” | Not recorded by the runner; summary did not run a fresh ruling |
| 5 (E, repeat breach under amended law) | COVERED_BREACH | VIOLATION | MINOR | “No faction may UNDERMINE any other faction.” | true |

Case 4 was returned as SUMMARY at filing, linked to holding case 1; no separate ruling transaction is in the proof. The adversarial duplicate filing A′ finalized as an expected failure with CASE_CLAIM_DUPLICATE (0x2145d964296c7b5c5ac87c875f026ea072368db330dbe4fdf97ec784cbc6cf1d). Case E′ finalized as an expected failure with CITED_LAW_NOT_EFFECTIVE (0x475cbcdce8d8bf7d21439e6afbc3125c977e729eed9b5066a856b6f26f3531d2).

Case C used an adversarial instruction in the claim, but the recorded disposition remained NOT_COVERED because GROW_WEALTH was outside the statute. Case B applied REPRIMAND; the later breach in case E received MINOR. For cases A, B, C, and E the runner observed both the CaseLaw holding and Republic outcome arrive without recovery. A separate recovery replay for A finalized successfully with both replay flags false and the scenario’s read-back guards unchanged. Case D is a summary of the prior holding and was not included in the runner’s awaited multi_emit measurements.

## Crisis result

Crisis 1, “The Officeholder Paradox,” opened at round 4 with severity 1. The planned Reformer response was submitted. The judge transaction finalized successfully and returned NOT_MET; close_crisis also finalized successfully and returned FAILED. This is a successful execution of a negative crisis outcome, not evidence that the response criterion was met.

- open_crisis: 0x6266e2fe650472f6925b177472eca4a962f98e8986b6ec93ca3714f4be45c6ae
- judge_crisis_response: 0x1cf77ac2c2d1bee51f0ee140b020237b5795dada40cfa5ca401d2926a5cfd74a — NOT_MET
- close_crisis: 0xd0d6b4cdde7983b0717669c0e14a576872b710117188c5e44b1aab76c0d2d77f — FAILED

## Final storage counters

These are read-only live reads taken after r10 fallback, not the r9 checkpoint in the demo file. Republic and Court expose get_storage_stats; CaseLaw exposes get_registry_summary, which is the available bounded-registry counter view.

| Contract | Final counters |
| --- | --- |
| Republic | active_law_count=1; law_count=3; retained_laws=3; crisis_count=1; retained_crises=1; retained_rounds=10; pruned_round_count=0; retirement_queue=8 |
| RepublicCourt | case_count=5; retained_cases=5; open_cases=0; stayed_cases=0 |
| CaseLaw registry | breach_count=2; compliant_count=0; holding_count=4; safe_harbor_count=2; contract_version=1.0.0; policy_version=LOOPHOLE_CASE_LAW_V1 |

No storage-budget refusal was recorded. These views return counts, not byte-size or per-write cost, so this run does not establish a writes-per-day estimate or whether deletion measurably reduced storage cost.

## Abandoned worlds and resume history

### Abandoned attempts 1–3

1. **Attempt 1, 2026-10-18:** the archived deployment notes record a stale 300-second commit configuration and a StudioNet 503; the first commit window was missed. The retained deployment summary lists Republic 0x0d763952e28ad6ea67535fE1646c1DB46f65008F, CaseLaw 0xF2b831B05dB4ea3c495463CdF0E6e604D0349117, and Court 0x5133989b6c628189739AA184B399D99f9525189D. No full release artifact is retained.
2. **Attempt 2, release record deployments/abandoned/studionet-2026-10-18T04-48-26.345Z.json:** source commit a59c069397ae5ddf6513ba533c91fcb7d9619f88. Windows refused a checkpoint rename after r3; the r4 commit window later passed. The archive contains partial case/law progress, not a completed demo or verified proof.
3. **Attempt 3, release record deployments/abandoned/studionet-2026-10-18T10-15-55.673Z.json:** workflow 39128701218 stopped at r6 because StudioNet reported “Server busy: all 8 execution slots occupied, retry later.” The restart record says cases B/C expired before recovery; that world was abandoned. Its Case A partial-evidence file is historical only and is not part of this proof.

### Requested resume runs

| Run | GitHub result | Cause / outcome |
| --- | --- | --- |
| [39152470534](https://github.com/Leokings/loophole/actions/runs/39152470534) | Completed successfully as a resumable checkpoint | Runner exited with code 75 at a safe checkpoint, saved state, and queued the next job. |
| [39164345888](https://github.com/Leokings/loophole/actions/runs/39164345888) | Failed | At r7, recovery result flags were not decoded from GenVM’s readable, non-strict-JSON payload; the chain call itself had succeeded and the flags were false. |
| [39215911174](https://github.com/Leokings/loophole/actions/runs/39215911174) | Failed | Checkpoint source commit 8c085efd differed from runner commit a7381e5; the guard refused before execution even though contracts/ was byte-identical. |
| [39219429093](https://github.com/Leokings/loophole/actions/runs/39219429093) | Failed | Checkpoint metadata no longer pointed at the saved release record (“Demo checkpoint belongs to another deployment record”). No demo transaction was sent in that job. |
| [39221192010](https://github.com/Leokings/loophole/actions/runs/39221192010) | Scenario completed; workflow failed during proof verification | All 11 stages and 119 scenario receipts completed. The old verifier incorrectly required txDataDecoded.type=deploy for the finalized Republic deploy. The local verifier fix also handled an undecoded probe write by matching the exact method field in the receipt’s readable calldata; local live verification now passes. The GitHub run was not rerun. |

## Live evidence vs GLSim-only coverage

**Proven live on StudioNet:** the three deployed contract source hashes; the probe deployment/write; 119 finalized scenario transactions including the five expected failures; four-seat claims and the scripted round lifecycle; law certification/enactment; the crisis NOT_MET/FAILED result; cases 1–5 and their recorded labels, quotes, sanctions and summary reuse; unauthorized-call and duplicate/expired-law guards; finality callback delivery for A/B/C/E; the recovery replay’s false flags; and the r10 AI_FALLBACK actions. The read-only verifier checked 126 unique receipts and the current code digests.

**GLSim/direct tests only, not exercised by this live story:** the local test suite’s broad edge cases such as 200-round bounded history, stayed-case/expiry/decider paths, crisis timeout to INSUFFICIENT, and crisis-slot skipping. The live crisis returned NOT_MET, not INSUFFICIENT. Human browser-wallet interaction, the deployed website/keeper flow, organic AI-seat FILE_SUIT, and a logged-out Explorer-link sweep were not part of this test. Historical mutable read-backs in the manifest remain snapshots; the proof verifier re-checked holdings but intentionally does not claim that every mutable snapshot is current.

## Tests and verification

- New proof receipt tests: 6 passed, including undefined txDataDecoded deployment fallback, mismatch rejection, and readable-calldata method matching.
- npm run verify:proof — passed against live StudioNet: 126 transactions, 3 contracts, 5 case links; printed mutable_readbacks as historical (not re-checked).
- npm run check in web/ — passed: ESLint, TypeScript, 93 tests across 14 files, optimized Next.js production build.
- python scripts/verify.py --integration — passed: 99 direct tests, 2 five-validator GLSim integration tests, web checks (93 tests and production build), scheduler checks (5 tests and dry-run deploy); final line: Loophole verification passed.

## Deviations from spec

| Spec item | Expected | Observed / disposition |
| --- | --- | --- |
| Demo commit window | 600 seconds | Deployed world used 1,200 seconds; reveal remained 600 seconds. Reported rather than concealed. |
| CaseLaw storage measurement | get_storage_stats | Contract’s available read method is get_registry_summary; captured its live bounded counts after r10. |
| Storage budget | Derive writes/day and deletion savings from size/cost | No byte-size or per-write-cost value was returned, so those estimates cannot be calculated from this run. |

## Open questions for Claude

1. Review the case-law mechanism and its distinctiveness against current Portal court projects and the submission cohort.
2. Should the release runner be changed so future deployments enforce the 600-second commit default?
3. Should a follow-up task add an explicit CaseLaw get_storage_stats view with byte/cost measurements?

## Risk notes

- The source decoder fallback is limited: deployment items require either decoded deployment type or a FINALIZED receipt whose recipient equals the proof contract address. A present, conflicting recipient still fails. For ordinary calls with missing txDataDecoded, method validation requires an exact method field in GenVM’s readable calldata. The deployed-source SHA-256 check is unchanged.
- The proof and report are committed to v7, not deployed to Vercel or submitted to the Portal. The website and keeper were not touched.
- deploy/demo-state.json and .live-evidence/v7-deployment-state.json were restored locally from origin/live-state but remain ignored/private workflow artifacts and are not committed.

## Final gates

| Gate | Verdict | Evidence |
| --- | --- | --- |
| Technical readiness | PASS | 126 live receipts and deployed code digests verified; full local/integration checks pass. The live demo reached all 11 stages, with the timing deviation above disclosed. |
| Distinctiveness | FAIL — independent review pending | Mechanism and live cases are documented, but the required review against the current Portal court cohort has not been completed here. |
| Evidence readiness | FAIL — public review checks remain | The proof manifest is locally verified and committed, but the logged-out Explorer sweep and public app/keeper V7 release were not performed. The Portal and Vercel were intentionally left untouched. |
