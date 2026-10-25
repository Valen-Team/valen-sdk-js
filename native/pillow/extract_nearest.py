"""Extract the unchanged nearest-neighbor function from pinned Pillow Geometry.c."""
import sys
from pathlib import Path
source=(Path(sys.argv[1])/"src/libImaging/Geometry.c").read_text()
end=source.index("static inline int\ncheck_fixed",source.index("ImagingScaleAffine("))
start=source.rfind("static int",0,source.index("ImagingScaleAffine("))
assert start>=0
Path(sys.argv[2]).write_text("/* Unmodified Pillow 13.0 ImagingScaleAffine; see PILLOW-LICENSE.txt. */\n#define COORD(v) ((v) < 0.0 ? -1 : ((int)(v)))\n"+source[start:end])
