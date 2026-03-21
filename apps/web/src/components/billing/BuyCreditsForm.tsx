"use client";

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { api } from '~/utils/api';

import { CREDITS_PER_DOLLAR } from '@shortgen/db';

import type { Session } from "next-auth";

interface BuyCreditsFormProps {
  successUrl: string;
  cancelUrl: string;
  session: Session | null;
  className?: string;
}

export function BuyCreditsForm({
  successUrl,
  cancelUrl,
  session,
  className,
}: BuyCreditsFormProps) {
  const [quantity, setQuantity] = useState(5);

  const createCreditPurchase = api.billing.createCreditPurchase.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const credits = quantity * CREDITS_PER_DOLLAR;

  const handleSubmit = () => {
    if (!session) {
      void signIn();
      return;
    }
    createCreditPurchase.mutate({
      quantity,
      successUrl,
      cancelUrl,
    });
  };

  return (
    <div className={className}>
      {createCreditPurchase.isError && (
        <p className="mb-2 text-sm text-destructive">
          {createCreditPurchase.error?.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span>Quantity:</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)),
              )
            }
            className="w-20"
          />
          <span className="text-muted-foreground">
            × {CREDITS_PER_DOLLAR} = {credits} credits
          </span>
        </label>
        <Button
          variant="outline"
          onClick={handleSubmit}
          disabled={createCreditPurchase.isPending}
        >
          {session
            ? `Buy $${(quantity * CREDITS_PER_DOLLAR) / 100}`
            : "Buy credits"}
        </Button>
      </div>
    </div>
  );
}
