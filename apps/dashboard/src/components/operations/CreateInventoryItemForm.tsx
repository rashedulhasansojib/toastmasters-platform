'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryItemCategory } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitAction } from '@/lib/toast';

export function CreateInventoryItemForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryItemCategory>('equipment');
  const [unit, setUnit] = useState('unit');
  const [openingQuantity, setOpeningQuantity] = useState('1');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              category,
              unit,
              openingQuantity: Number(openingQuantity),
              location: location || undefined,
            }),
          }),
        {
          loading: 'Adding item…',
          success: 'Item added',
          error: 'Could not add that item.',
        },
      );
      if (!result) return;
      setName('');
      setLocation('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="inv-name">Name</Label>
        <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as InventoryItemCategory)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="banner">Banner</SelectItem>
            <SelectItem value="trophy">Trophy</SelectItem>
            <SelectItem value="timer_device">Timer device</SelectItem>
            <SelectItem value="stationery">Stationery</SelectItem>
            <SelectItem value="equipment">Equipment</SelectItem>
            <SelectItem value="book">Book</SelectItem>
            <SelectItem value="signage">Signage</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="inv-unit">Unit</Label>
        <Input id="inv-unit" value={unit} onChange={(e) => setUnit(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="inv-qty">Opening quantity</Label>
        <Input
          id="inv-qty"
          type="number"
          min="0"
          value={openingQuantity}
          onChange={(e) => setOpeningQuantity(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="inv-location">Location</Label>
        <Input id="inv-location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add item'}
      </Button>
    </form>
  );
}
