import { Suspense } from "react";
import { useRoutes } from "react-router-dom";
import { LoadingBlock } from "@/components/base/DataState";
import routes from "./config";

export function AppRoutes() {
  const element = useRoutes(routes);
  // Les pages sont chargées à la demande (lazy) : écran d'attente le temps du chargement.
  return <Suspense fallback={<LoadingBlock />}>{element}</Suspense>;
}
