import { createContext, useContext } from "react";

// Disponibiliza os dados da conta logada (e-mail, status da licença, sair)
// pra qualquer componente dentro do App, sem precisar passar prop por prop
// através da árvore inteira. Quem fornece o valor é o AuthGate.
export const AccountContext = createContext(null);

export function useAccount() {
  return useContext(AccountContext);
}
