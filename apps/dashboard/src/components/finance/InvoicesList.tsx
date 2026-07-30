'use client';

import { useState } from 'react';
import { invoice as invoiceSchema, type Invoice } from '@toastmasters/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { submitAction } from '@/lib/toast';

function InvoiceActions({
  clubUnitId,
  invoice,
  onSaved,
}: {
  clubUnitId: string;
  invoice: Invoice;
  onSaved: (invoice: Invoice) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function recordPayment() {
    const ledgerEntryId = window.prompt('Ledger entry ID for this payment?');
    if (!ledgerEntryId) return;
    const amount = window.prompt('Amount paid?');
    if (!amount) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/invoices/${invoice.id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ledgerEntryId, amount: Number(amount) }),
          }),
        {
          loading: 'Recording payment…',
          success: 'Payment recorded',
          error: 'Could not record that payment.',
        },
      );
      if (!result) return;
      onSaved(invoiceSchema.parse(await result.json()));
    } finally {
      setSubmitting(false);
    }
  }

  async function voidInvoice() {
    const reason = window.prompt('Reason for voiding?');
    if (!reason) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/invoices/${invoice.id}/void`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }),
        {
          loading: 'Voiding invoice…',
          success: 'Invoice voided',
          error: 'Could not void that invoice.',
        },
      );
      if (!result) return;
      onSaved(invoiceSchema.parse(await result.json()));
    } finally {
      setSubmitting(false);
    }
  }

  async function creditNote() {
    const reason = window.prompt('Reason for the credit note?');
    if (!reason) return;
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/invoices/${invoice.id}/credit-note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          }),
        {
          loading: 'Issuing credit note…',
          success: 'Credit note issued',
          error: 'Could not issue that credit note.',
        },
      );
      if (!result) return;
      onSaved(invoiceSchema.parse(await result.json()));
    } finally {
      setSubmitting(false);
    }
  }

  if (invoice.status === 'void' || invoice.creditNoteForInvoiceId) return null;

  return (
    <div className="flex gap-2">
      {invoice.status !== 'paid' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={recordPayment}
          disabled={submitting}
        >
          Record payment
        </Button>
      )}
      {invoice.payments.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={voidInvoice}
          disabled={submitting}
        >
          Void
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={creditNote} disabled={submitting}>
        Credit note
      </Button>
    </div>
  );
}

export function InvoicesList({
  clubUnitId,
  invoices,
  onSaved,
}: {
  clubUnitId: string;
  invoices: Invoice[];
  onSaved: (invoice: Invoice) => void;
}) {
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {invoices.map((inv, i) => (
          <div key={inv.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  #{inv.invoiceNumber} — {inv.total} {inv.currency} ({inv.status})
                </p>
                <p className="text-sm text-muted-foreground">
                  {inv.issuedToName} · due {inv.dueOn}
                  {inv.creditNoteForInvoiceId && ` · credit note for ${inv.creditNoteForInvoiceId}`}
                </p>
              </div>
              <InvoiceActions clubUnitId={clubUnitId} invoice={inv} onSaved={onSaved} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
