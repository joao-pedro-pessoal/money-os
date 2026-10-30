"use client";

import { useState } from "react";
import { submitAccountBalance } from "@/actions/accounts";
import AccountBalanceFields, { type BalanceAccount } from "./AccountBalanceFields";
import EditForm from "./EditForm";
import { useFormat } from "./useFormat";

export default function AccountBalanceEditor({ account }: { account: BalanceAccount }) {
  const { input } = useFormat();
  const [value, setValue] = useState(input(account.balance));
  return <EditForm action={submitAccountBalance} submitLabel="Save balance">
    <AccountBalanceFields account={account} value={value} onChange={setValue} />
  </EditForm>;
}
