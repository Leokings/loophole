# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
# SPDX-License-Identifier: MIT
"""Minimal one-write, one-view runner compatibility probe."""

from genlayer import *


class Probe(gl.Contract):
    value: str

    def __init__(self):
        if gl.message.value != 0:
            raise gl.vm.UserError("[EXPECTED] VALUE")
        self.value = ""

    @gl.public.write
    def write_probe(self, value: str) -> None:
        if gl.message.value != 0:
            raise gl.vm.UserError("[EXPECTED] VALUE")
        self.value = value

    @gl.public.view
    def read_probe(self) -> str:
        return self.value
