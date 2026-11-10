"""Check a focused training input against the docked Android keyboard.

Open the target picker and focus a field, then run this script. Pass --inline for
an inline field without a Done button. Requires adb, Python 3 and an unlocked phone.
Only geometry is printed; text, tokens and the complete hierarchy are not logged.
"""
import argparse
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--inline", action="store_true")
args = parser.parse_args()

def adb(*parts):
    return subprocess.check_output(["adb", *parts], text=True)

def bounds(node):
    return [int(value) for value in re.findall(r"\d+", node.get("bounds", ""))]

with tempfile.TemporaryDirectory(prefix="vermillion-keyboard-") as directory:
    target = str(Path(directory) / "hierarchy.xml")
    adb("shell", "uiautomator", "dump", "/sdcard/vermillion-keyboard-check.xml")
    adb("pull", "/sdcard/vermillion-keyboard-check.xml", target)
    nodes = list(ET.parse(target).iter("node"))
    adb("shell", "rm", "/sdcard/vermillion-keyboard-check.xml")

shown = "mInputShown=true" in adb("shell", "dumpsys", "input_method")
frames = re.findall(r"type=ime frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\].*visible=true", adb("shell", "dumpsys", "window"))
keyboard_top = int(frames[0][1]) if frames else None
focused = [node for node in nodes if node.get("class") == "android.widget.EditText" and node.get("focused") == "true"]
done = next((node for node in nodes if node.get("content-desc") == "Done"), None)
geometry = [bounds(node) for node in focused]
done_bottom = bounds(done)[3] if done is not None else None
print({"keyboardShown": shown, "keyboardTop": keyboard_top, "focusedInputs": geometry, "doneBottom": done_bottom})
visible = shown and keyboard_top is not None and geometry and all(0 < rectangle[3] <= keyboard_top for rectangle in geometry)
if not args.inline:
    visible = visible and done_bottom is not None and done_bottom <= keyboard_top
if not visible:
    raise SystemExit("FAIL: focused input or picker action is obscured, or the keyboard is not open")
print("PASS: the focused input and required controls are above the keyboard")
