import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFleetData } from "../../context/FleetDataContext";
import { Button, Modal, Notice } from "../kit";

/** Edit / archive / restore / delete for a resource, with readable refusals. */
export function ResourceHeaderActions({ kind, id, label, archived, onEdit, listPath }: { kind: "truck" | "trailer" | "driver"; id: string; label: string; archived: boolean; onEdit: () => void; listPath: string }) {
  const { service } = useFleetData();
  const navigate = useNavigate();
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noun = kind === "truck" ? "a viatura" : kind === "trailer" ? "o reboque" : "o motorista";
  return (
    <>
      {!archived ? <Button onClick={onEdit}>Editar</Button> : null}
      {!archived ? (
        <Button
          variant="ghost"
          onClick={async () => {
            const r = await service.setArchived(kind, id, true);
            setError(r.ok ? null : { title: `Não é possível arquivar ${noun}`, detail: r.errors.join(" ") });
          }}
        >
          Arquivar
        </Button>
      ) : (
        <Button variant="secondary" onClick={async () => { const r = await service.setArchived(kind, id, false); setError(r.ok ? null : { title: "Não foi possível restaurar", detail: r.errors.join(" ") }); }}>
          Restaurar
        </Button>
      )}
      <Button variant="ghost" className="text-[var(--danger)]" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
      {error ? (
        <div className="fixed bottom-4 right-4 z-[150] w-[420px] shadow-[var(--shadow-md)]">
          <Notice title={error.title} action={<Button size="sm" variant="ghost" onClick={() => setError(null)}>Fechar</Button>}>{error.detail}</Notice>
        </div>
      ) : null}
      {confirmDelete ? (
        <Modal
          title={`Eliminar ${label}?`}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const r = await service.deleteResource(kind, id);
                  setConfirmDelete(false);
                  if (r.ok) navigate(listPath);
                  else setError({ title: `Não é possível eliminar ${noun}`, detail: r.errors.join(" ") });
                }}
              >
                Eliminar definitivamente
              </Button>
            </>
          }
        >
          A eliminação só é permitida para registos criados por engano que nenhum trabalho referencie. Para retirar um recurso de serviço, use «Arquivar» — o histórico mantém-se.
        </Modal>
      ) : null}
    </>
  );
}
