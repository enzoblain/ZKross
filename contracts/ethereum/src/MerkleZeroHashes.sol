// SPDX-License-Identifier: Apache-2.0
// GENERATED FILE, DO NOT EDIT. Regenerate with scripts/poseidon2/gen-zero-hashes-sol.cjs.
pragma solidity ^0.8.24;

/// @title SPP's Merkle zero hashes.
/// @notice Port of `soroban_utils::poseidon2::ZERO_HASHES`: level 0 is the
/// empty leaf, Poseidon2 (t = 4) of "XLM" = (88, 76, 77) with domain 0, and
/// each level above is `Poseidon2.compress` of the level below with itself.
/// Level 32 is the root of an empty 32-level tree.
library MerkleZeroHashes {
    /// Number of levels the table covers (SPP's `ZERO_HASH_LEVELS`).
    uint256 internal constant LEVELS = 33;

    error ZeroHashLevelOutOfRange();

    function zeroHash(uint256 level) internal pure returns (uint256) {
        if (level == 0) return 0x25302288db99350344974183ce310d63b53abb9ef0f8575753eed36e0118f9ce;
        if (level == 1) return 0x21f4ea2492ade006a8ee7fb764060a95a4eef5ca931e037bcdf05fc28067d008;
        if (level == 2) return 0x0ebfb4d2f05bb6a473c9bff72586fec806f1ac237015c570d7c78249cf7d7740;
        if (level == 3) return 0x066882a5dab186d4d63fa6600f9ea3d5cdfef2a2811c89731128a729d7e8b897;
        if (level == 4) return 0x065db3148d8da5329beaec5042785c69f2ce0709e26d468bda1e255c599b5686;
        if (level == 5) return 0x19926faa23b0737d467f9476f0f84b2968ff6666e16a23e4d44898f884504764;
        if (level == 6) return 0x287c485a72ccc8d4d80692d97eb62c164953a0422791f6af6214a9a7ad2279c0;
        if (level == 7) return 0x1f729e103e7d415f728dc945e3b6e2c40ac0cb369e532ba50a569790cdde2acc;
        if (level == 8) return 0x1887e71f92217ffe86620e6ea5a71ad3521fade4c83203ffa3e838fe3d6e7203;
        if (level == 9) return 0x295aa78e56c7a09a864f2f4175100095f3e7b9ef2a911af87cb0f3f7eef27700;
        if (level == 10) return 0x0517032a796b0340dc5f9df28b1fd320daba24d5a45335a137167300ee368828;
        if (level == 11) return 0x15fadf4947d2a40c7b439e83ea3c979ff725aad11c47aaaf892aab413db2dcdd;
        if (level == 12) return 0x00acb7236b6d87f4875b3b9d1720a9e0682c70e4bc6d54edf61faa2bc93841d6;
        if (level == 13) return 0x09836dd9054d560ae60ea6a8033404b3e40309f6ee4d170acb92e6667e86c775;
        if (level == 14) return 0x2198946b17f9ba035d7ee728741ca5f4e5875cb6afb29684a6f5f9a82feec482;
        if (level == 15) return 0x15d4b16830604dbe0b3212e31f9574787c15b0f54e5e24b080687e7a6ef6d455;
        if (level == 16) return 0x2d07f73e04cf0a538037ba07561651ac979bb00e1705c75ddc9516ec4b8a6a76;
        if (level == 17) return 0x02f8731aea289a6b401000487e8c6925c922407eeca58f2e18cc8ad9b6c5d13f;
        if (level == 18) return 0x0a30053c1787c79782e60bc8d825e9e323c8a902f93aa5923c24d17d16db925c;
        if (level == 19) return 0x0ea3058d9958ba5fe441fbd79dc968f449215ddee66146161afcf34c34bfa490;
        if (level == 20) return 0x27b9937e47a65983ad50a5b7f6b9cf0542c91a8dfa1714cef89013438a06f9b7;
        if (level == 21) return 0x2d347be4e547c5837c1b2172322628a0c48d668193196791b310674b0453c039;
        if (level == 22) return 0x03f2461b35b892fc8c589706283d1083f4d2d66be4f97e461abaf2f06f89cffd;
        if (level == 23) return 0x259b8fa0082cf6066f005a0a49006712fe1dcfef6a98d68f7ab445f88adb61a7;
        if (level == 24) return 0x1980a5f7eac09daac7b2d2179ba1d970fb3f0213dd90613128f5d55863d84414;
        if (level == 25) return 0x1cfcd94aabc23cacd4ccab22e87d2303200d09b03042b2047f03d2e0def57e85;
        if (level == 26) return 0x102bdc81acbf8c52d35871a21ff27516ddbe6e31ef51740c49bd2ee2b1980c21;
        if (level == 27) return 0x2fad84f388a263e714c7b39fb0dd24be6158b9e21480aa3a60778707889f76ad;
        if (level == 28) return 0x2ace942d30becb369f1cfd025b5394d6ee4c97f55930048a18fb501128c87777;
        if (level == 29) return 0x0930feccbf762a6b239acee2c369de9a31bd3e232c90c64af141945c1c415463;
        if (level == 30) return 0x1a59e2ba55f1e829bca2c6316a9ccd08017d2e9bf532942c26d82365ca604b58;
        if (level == 31) return 0x1a8e840c84e2fb5212d61f09ad5f91d6a70a83074e942772ef74b42d12a11f50;
        if (level == 32) return 0x134b50df02e2ccb98b59af2c2c55d7a41ff102681730c42ba364dbff1271cf62;
        revert ZeroHashLevelOutOfRange();
    }
}
