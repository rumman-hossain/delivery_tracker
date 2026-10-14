# Firestore rules tests

Tests `api/firestore.rules` against the Firebase emulator (needs a JDK on `PATH`).

    cd rules-tests && npm install && npm test

The emulator listens on 8086 so it can run next to the Firestore emulator on 8085 used by the Go integration suite.
