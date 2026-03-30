import { Navigate } from "react-router";
import { APP_ROUTES } from "../../util/constants";

/** Rotas antigas de agendamento do paciente redirecionam para Pagamentos (fluxo unificado). */
export default function MyAppointments() {
  return <Navigate to={APP_ROUTES.PATIENT.PAYMENTS} replace />;
}
