# Builds the device catalogue from the DevFin export: active rows only, brands in
# the order and spelling the live "Choose a brand" screen uses.
import csv, json, sys
src, out_js, out_ts = sys.argv[1:4]
ORDER = [("TECNO","TECNO"),("INFINIX","Infinix"),("XIAOMI","Xiaomi"),("SAMSUNG","Samsung"),("ITEL","itel"),
         ("OPPO","Oppo"),("VIVO","Vivo"),("NOKIA","Nokia"),("REALME","Realme"),("HUAWEI","Huawei"),("ZTE","Zte"),
         ("HONOR","Honor"),("NUBIA","Nubia"),("POCO","Poco"),("REDMI","Redmi"),("BLADE","Blade")]
rows = [r for r in csv.DictReader(open(src, encoding="utf-8-sig")) if r["Status"].strip() == "Active"]
keys = {k for k, _ in ORDER}
unknown = sorted({r["Brand"] for r in rows} - keys)
if unknown: sys.exit(f"brands missing from ORDER: {unknown}")
devs = []
for key, label in ORDER:
    for i, r in enumerate([r for r in rows if r["Brand"] == key]):
        name = " ".join(r["Display model"].split())
        price = int(round(float(r["Price (NGN)"])))
        if price <= 0: continue
        devs.append({"id": f"{key.lower()}-{i+1}", "brand": key, "name": name, "price": price})
brands = [{"key": k, "label": l} for k, l in ORDER]
print(len(devs), "devices")
for k, l in ORDER:
    ds = [d for d in devs if d["brand"] == k]
    print(l, len(ds), min(d["price"] for d in ds))
js = "const BRANDS=" + json.dumps(brands, separators=(",", ":")) + ";\nconst DEVICES=" + json.dumps(devs, separators=(",", ":"), ensure_ascii=False) + ";"
open(out_js, "w").write(js)
ts = ("// Generated from the DevFin device export (devfin-devices-2026-10-17.csv): active models only.\n"
      "// Brand order and spelling follow the live \"Choose a brand\" screen. Regenerate rather than hand-edit.\n"
      "import type { Device } from \"./data\";\n\n"
      "export const BRANDS: readonly { key: string; label: string }[] = " + json.dumps(brands, indent=2) + ";\n\n"
      "export const DEVICES: readonly Device[] = [\n" + ",\n".join("  " + json.dumps(d, ensure_ascii=False) for d in devs) + ",\n];\n")
open(out_ts, "w").write(ts)
