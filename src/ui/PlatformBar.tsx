import { useEditor } from "../store";
import { PLATFORMS, resolvePlatform, type PlatformId } from "../platforms";

export function PlatformBar() {
  const project = useEditor((s) => s.project);
  const setPlatform = useEditor((s) => s.setPlatform);
  const { spec, format } = resolvePlatform(project);

  return (
    <div className="plat" role="tablist" aria-label="Platform">
      <div className="plat-row">
        {PLATFORMS.map((p) => {
          const on = spec.id === p.id;
          return (
            <div key={p.id} className={on ? "plat-cell on" : "plat-cell"}>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? "plat-tab on" : "plat-tab"}
                onClick={() => {
                  if (on) return;
                  setPlatform(p.id as PlatformId);
                }}
              >
                {p.name}
              </button>
              {on && p.formats.length > 1 && (
                <div className="plat-subs">
                  {p.formats.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={format.id === f.id ? "plat-sub on" : "plat-sub"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlatform(p.id as PlatformId, f.id);
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
