import { useAuth } from '@/hooks/useAuth';

/**
 * Mode lecture seule des écrans d'administration.
 *
 * Au lieu de masquer l'administration aux approbateurs, on leur laisse
 * consulter les données (connecteurs, tenants, système, authentification)
 * et on neutralise toutes les actions d'écriture.
 */
export const useReadOnly = () => {
  const { mode, permissions } = useAuth();
  if (mode === 'awx') return !permissions.canAdmin;
  return false;
};

export default useReadOnly;