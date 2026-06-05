const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8');

// Add GripHorizontal
if (!code.includes('GripHorizontal')) {
  code = code.replace('X,\n', 'X,\n  GripHorizontal,\n');
}

const stateToAdd = `  // Draggable Grid State
  const [draggedModule, setDraggedModule] = useState<string | null>(null);
  const [moduleOrder, setModuleOrder] = useState<string[]>([
    'kpis',
    'trend',
    'supplier',
    'category',
    'gantt',
    'warnings'
  ]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedModule(id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  };

  const handleDragEnter = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedModule || draggedModule === targetId) return;
    setModuleOrder(prev => {
      const draggedIdx = prev.indexOf(draggedModule);
      const targetIdx = prev.indexOf(targetId);
      if (draggedIdx === targetIdx) return prev;
      const newOrder = [...prev];
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedModule);
      return newOrder;
    });
  };

  const modulesMap = {
    'kpis': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-3 transition-transform duration-300',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 h-full pointer-events-auto">`;

const kpiTarget = `  return (
    <div className="space-y-6 pb-12">
      
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-800">采购综合分析</h2>
        {dateRange && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold font-mono tracking-tight uppercase">
              当前数据范围: {dateRange.start} <span className="text-indigo-400 font-sans mx-0.5">至</span> {dateRange.end}
            </span>
          </div>
        )}
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">`;

code = code.replace(kpiTarget, stateToAdd);

// Close KPIs and start Trend
const trendTarget = `      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Trend Line Chart */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm xl:col-span-2 space-y-4">`;

const trendReplacement = `      )
    },
    'trend': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-2 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">`;

code = code.replace(trendTarget, trendReplacement);

// Close Trend and start Supplier
const supplierTarget = `        {/* Supplier Bar Chart */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm space-y-4">`;
const supplierReplacement = `      )
    },
    'supplier': {
      colSpan: 'col-span-1 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">`;
code = code.replace(supplierTarget, supplierReplacement);


// Close Supplier and start Category
const categoryTarget = `        {/* Category Pie Chart */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm space-y-4">`;
const categoryReplacement = `      )
    },
    'category': {
      colSpan: 'col-span-1 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">`;
code = code.replace(categoryTarget, categoryReplacement);


// Close Category and start Gantt
const ganttTarget = `        {/* Execution Gantt Chart */}
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm xl:col-span-2 space-y-4">`;
const ganttReplacement = `      )
    },
    'gantt': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-2 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">`;
code = code.replace(ganttTarget, ganttReplacement);


// Close Gantt and close Analytics Grid -> Start Warnings
const warningsTarget = `      </div>

      {/* Estimated Timeline Warnings with Configurable Grid */}
      <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md space-y-4">`;
const warningsReplacement = `      )
    },
    'warnings': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-3 transition-transform duration-300',
      content: (
        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md h-full space-y-4 pointer-events-auto">`;
code = code.replace(warningsTarget, warningsReplacement);

// Close Warnings and Start Modals (Render actual grid)

const modalsTarget = `      {/* Modals for Cards */}
      {modalView !== 'none' && (`;

const renderReplacement = `      )
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-800">采购综合分析</h2>
        {dateRange && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold font-mono tracking-tight uppercase">
              当前数据范围: {dateRange.start} <span className="text-indigo-400 font-sans mx-0.5">至</span> {dateRange.end}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {moduleOrder.map(id => {
          const mod = modulesMap[id as keyof typeof modulesMap];
          return (
            <div 
              key={id}
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragEnd={() => setDraggedModule(null)}
              onDragEnter={(e) => handleDragEnter(e, id)}
              onDragOver={(e) => e.preventDefault()}
              className={\`\${mod.colSpan} \${draggedModule === id ? 'opacity-30 scale-[0.98]' : 'opacity-100'} transform relative group cursor-move\`}
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 z-10 p-2 bg-slate-900/50 backdrop-blur rounded-lg pointer-events-none text-white transition-opacity duration-200 flex items-center justify-center">
                <GripHorizontal className="w-4 h-4" />
              </div>
              {mod.content}
            </div>
          );
        })}
      </div>

      {/* Modals for Cards */}
      {modalView !== 'none' && (`;

code = code.replace(modalsTarget, renderReplacement);

fs.writeFileSync('src/components/Dashboard.tsx', code);
console.log("Rewrote dashboard");
