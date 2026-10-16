import type { WorkspaceTab } from "../workspaceTabs";
import { useEffect, useRef } from "react";
import {
  BriefcaseBusiness,
  Users,
  Truck,
  Route,
  Signpost,
  FileText,
} from "lucide-react";
import { sharedWork } from "../sharedComposition";
import { LENS_LABEL } from "./model";

const WORK_ICON = {
  Jobs: BriefcaseBusiness,
  Drivers: Users,
  Trucks: Truck,
  Fuel: Route,
  Restrictions: Signpost,
  Documents: FileText,
};
const description = (tab: WorkspaceTab) => {
  const work = sharedWork(tab.frame.state);
  return work
    ? `${tab.title} · ${work.domains.map((domain) => LENS_LABEL[domain]).join(", ")}`
    : tab.title;
};

export function WorkspaceTabs({
  tabs,
  selected,
  select,
  close,
}: {
  tabs: WorkspaceTab[];
  selected: string;
  select: (id: string) => void;
  close: (id: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <nav className="fx-workspace-tabs" aria-label="Separadores do ambiente">
      <div ref={list} role="tablist" aria-label="Áreas de trabalho abertas">
        {tabs.map((tab, index) => (
          <div
            className="fx-workspace-tab"
            key={tab.id}
            data-selected={tab.id === selected}
            title={description(tab)}
          >
            <button
              id={`workspace-tab-${index}`}
              type="button"
              role="tab"
              aria-label={description(tab)}
              aria-selected={tab.id === selected}
              aria-controls="fleetos-active-workspace"
              data-ix="follow"
              data-tab-id={tab.id}
              tabIndex={tab.id === selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => {
                const delta =
                  event.key === "ArrowRight"
                    ? 1
                    : event.key === "ArrowLeft"
                      ? -1
                      : 0;
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : delta
                        ? (index + delta + tabs.length) % tabs.length
                        : null;
                if (next === null) return;
                event.preventDefault();
                select(tabs[next].id);
                document.getElementById(`workspace-tab-${next}`)?.focus();
              }}
            >
              <span>{tab.title}</span>
              {sharedWork(tab.frame.state) && (
                <span className="sw-tab-domains" aria-hidden="true">
                  {sharedWork(tab.frame.state)!.domains.map((domain) => {
                    const Icon = WORK_ICON[domain];
                    return <Icon key={domain} size={11} />;
                  })}
                </span>
              )}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="fx-tab-close"
                data-ix="follow"
                aria-label={`Fechar separador: ${tab.title}`}
                onClick={() => close(tab.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
