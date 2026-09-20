"""Launch GLSim with Loophole's test-only Windows compatibility shim."""

import os
import sys


os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from gltest_windows_compat import install_glsim_direct_compatibility

install_glsim_direct_compatibility()

from glsim.__main__ import main


if __name__ == "__main__":
    main()
