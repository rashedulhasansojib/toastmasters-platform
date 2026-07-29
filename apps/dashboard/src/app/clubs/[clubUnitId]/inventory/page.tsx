import { listInventory } from '@/lib/operations';
import { CreateInventoryItemForm } from '@/components/operations/CreateInventoryItemForm';
import { InventoryList } from '@/components/operations/InventoryList';

export default async function ClubInventoryPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const items = await listInventory(clubUnitId);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Inventory</h1>
      <section className="flex flex-col gap-3">
        <CreateInventoryItemForm clubUnitId={clubUnitId} />
        <InventoryList clubUnitId={clubUnitId} items={items} />
      </section>
    </main>
  );
}
