
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type OnChangeFn,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import gtvetsLogo from '@/assets/gtvets_logo.png'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: any
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  exportTitle?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  meta,
  sorting: externalSorting,
  onSortingChange: setExternalSorting,
  exportTitle = "GTVET WEL System Data Export",
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const sorting = externalSorting ?? internalSorting
  const onSortingChange = setExternalSorting ?? setInternalSorting

  // eslint-disable-next-line
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: onSortingChange,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    meta,
  })

  const downloadCSV = () => {
    if (!data.length) return;
    
    const visibleColumns = table.getVisibleLeafColumns().filter(col => col.id !== 'actions' && col.id !== 'select');
    const headers = visibleColumns.map(col => typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id).join(",");
    
    const rowsExport = table.getCoreRowModel().rows.map(row => {
      return visibleColumns.map(col => {
        const val = row.getValue(col.id);
        const str = val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.includes(",") || str.includes('\n') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",");
    });
    
    const csv = [headers, ...rowsExport].join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDF = async () => {
    if (!data.length) return;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = new (jsPDF as any)('l', 'mm', 'a4'); // Export as Landscape
    
    try {
      const img = new Image();
      img.src = gtvetsLogo;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      // Adjust dimensions depending on the logo's original aspect ratio
      doc.addImage(img, 'PNG', 14, 10, 25, 25);
      
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59); // text-slate-800
      doc.text(exportTitle, 45, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // text-slate-500
      doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 45, 26);
    } catch(e) {
      console.warn("Could not load logo for PDF", e);
    }
    
    const visibleColumns = table.getVisibleLeafColumns().filter(col => col.id !== 'actions' && col.id !== 'select');
    const headers = visibleColumns.map(col => typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id);
    
    const rowsExport = table.getCoreRowModel().rows.map(row => {
      return visibleColumns.map(col => {
        const val = row.getValue(col.id);
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (autoTable as any)(doc, {
      startY: 40,
      head: [headers],
      body: rowsExport,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229] } // Indigo-600
    });
    
    doc.save(`export-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center gap-4 py-4 w-full">
        {table.getAllColumns().some(col => col.id === "name") && (
          <Input
            placeholder="Filter names..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="w-full sm:max-w-sm"
          />
        )}
        <div className="w-full sm:ml-auto sm:w-auto flex flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={downloadCSV}
            className="w-full sm:w-auto rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button 
            variant="outline" 
            onClick={downloadPDF}
            className="w-full sm:w-auto rounded-xl border-gray-200 hover:bg-gray-50 font-bold"
          >
            <FileText className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>
      <div className="rounded-md border bg-white border-gray-200 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-gray-200 hover:bg-gray-50">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="text-gray-700 font-semibold">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
