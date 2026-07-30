'use client';

import type { InstallmentPlan } from '@toastmasters/contracts';
import { useLocalCollection } from '@/hooks/use-local-collection';
import { CreateInstallmentPlanForm } from './CreateInstallmentPlanForm';
import { InstallmentPlansList } from './InstallmentPlansList';

export function InstallmentPlansSection({
  clubUnitId,
  initialPlans,
}: {
  clubUnitId: string;
  initialPlans: InstallmentPlan[];
}) {
  const { items, upsert } = useLocalCollection(initialPlans);

  return (
    <section className="flex flex-col gap-3">
      <h2>Installment plans</h2>
      <CreateInstallmentPlanForm clubUnitId={clubUnitId} onSaved={upsert} />
      <InstallmentPlansList clubUnitId={clubUnitId} plans={items} onSaved={upsert} />
    </section>
  );
}
