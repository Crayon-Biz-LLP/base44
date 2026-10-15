"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonVariants } from "@/components/ui/button";
import { Bot, User, Send, CheckCircle2, AlertTriangle, Loader2, Copy, ExternalLink, QrCode, Play, Info } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DEMO_INDUSTRIES, PromptKind } from "@/data/demo-prompts";
import { safeJson } from "@/lib/infra/fetch";

export default function BuilderChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [localInput, setLocalInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // App state
  const [tenantWorkflows, setTenantWorkflows] = useState<any[]>([]);
  const [activeIndustryId, setActiveIndustryId] = useState<string>(DEMO_INDUSTRIES[0].id);
  const [showTour, setShowTour] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch tenant workflows on mount to support the "edit" chip on a fresh session
    fetch("/api/workflow")
      .then(res => safeJson(res))
      .then(data => {
        if (data.workflows) setTenantWorkflows(data.workflows);
      })
      .catch(console.error);

    // Tour strip memory
    const tourDismissed = localStorage.getItem("opsdesk_tour_dismissed");
    if (tourDismissed) setShowTour(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  const dismissTour = () => {
    setShowTour(false);
    localStorage.setItem("opsdesk_tour_dismissed", "1");
  };

  const customSubmit = async (e?: any, overrideInput?: string, promptKind?: PromptKind, targetTitle?: string) => {
    if (e) e.preventDefault();
    const textToSubmit = overrideInput || localInput;
    if (!textToSubmit || !textToSubmit.trim()) return;
    
    const userMessage = { role: 'user', content: textToSubmit, id: Date.now().toString() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLocalInput('');
    setIsLoading(true);
    setError(null);

    // Resolve existingWorkflowId
    let existingWorkflowId = [...messages].reverse().find(m => m.workflowId)?.workflowId;
    
    if (!existingWorkflowId && promptKind === "edit" && targetTitle) {
      // Find by targetTitle from fetched tenant workflows
      const targetWf = tenantWorkflows.find(w => w.title.toLowerCase() === targetTitle.toLowerCase() && w.isActive);
      if (targetWf) {
        existingWorkflowId = targetWf.id;
      }
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, existingWorkflowId })
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || `API returned ${res.status}`);
      }
      
      const assistantMessageId = (Date.now() + 1).toString();
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: data.message, 
        id: assistantMessageId,
        workflowId: data.workflowId,
        appTitle: data.app_title || "Your Custom App",
        version: data.version,
        ui_schema: data.ui_schema,
        isDraft: true // Track draft status
      }]);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to connect to AI");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      customSubmit(e);
    }
  };

  const approveDraft = async (messageId: string, workflowId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to approve workflow");
      
      setMessages(msgs => msgs.map(m => m.id === messageId ? { ...m, isDraft: false } : m));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Link copied!");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center items-center">
      <Card className="w-full max-w-3xl h-[85vh] flex flex-col shadow-xl border-0 overflow-hidden">
        <CardHeader className="bg-white border-b sticky top-0 z-10">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Bot className="text-primary w-6 h-6" />
            </div>
            App Builder
          </CardTitle>
          <CardDescription className="text-sm">
            Describe your manual process. I'll generate a custom web app for your staff instantly.
          </CardDescription>
        </CardHeader>
        
        {showTour && (
          <div className="bg-primary/5 border-b border-primary/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm text-primary/80 overflow-x-auto">
              <span className="font-semibold text-primary flex items-center gap-1"><Play className="w-4 h-4"/> Tour:</span>
              <span className="flex items-center gap-1 font-medium text-gray-800"><span className="bg-primary text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center">1</span> Build</span>
              <span className="text-primary/40">→</span>
              <span className="flex items-center gap-1"><span className="bg-primary/20 w-4 h-4 rounded-full text-[10px] flex items-center justify-center">2</span> Approve</span>
              <span className="text-primary/40">→</span>
              <span className="flex items-center gap-1"><span className="bg-primary/20 w-4 h-4 rounded-full text-[10px] flex items-center justify-center">3</span> Share QR</span>
              <span className="text-primary/40">→</span>
              <span className="flex items-center gap-1"><span className="bg-primary/20 w-4 h-4 rounded-full text-[10px] flex items-center justify-center">4</span> Camera Capture</span>
              <span className="text-primary/40">→</span>
              <span className="flex items-center gap-1"><span className="bg-primary/20 w-4 h-4 rounded-full text-[10px] flex items-center justify-center">5</span> Dashboard</span>
            </div>
            <Button variant="ghost" size="sm" onClick={dismissTour} className="text-primary hover:bg-primary/10 -mr-2">Dismiss</Button>
          </div>
        )}

        <CardContent className="flex-1 flex flex-col p-0 md:p-0 bg-gray-50/50">
          {/* Persistent industry selector */}
          <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">Industry</span>
              {DEMO_INDUSTRIES.map(ind => (
                <button
                  key={ind.id}
                  onClick={() => setActiveIndustryId(ind.id)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 disabled:opacity-60 ${
                    activeIndustryId === ind.id 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {ind.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {DEMO_INDUSTRIES.find(i => i.id === activeIndustryId)?.prompts.map((p, idx) => (
                <button 
                  key={idx} 
                  onClick={() => customSubmit(undefined, p.text, p.kind, p.targetTitle)}
                  disabled={isLoading}
                  className="bg-white border border-gray-200 hover:border-primary hover:bg-primary/5 text-left rounded-xl shadow-sm px-3 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="block text-xs font-medium text-gray-800">"{p.text}"</span>
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                        <Info className="w-3 h-3 text-primary/60 shrink-0" />
                        <span>{p.caption}</span>
                      </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable thread */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-2 py-10">
                <h3 className="text-2xl font-bold text-gray-800">What do you want to build?</h3>
                <p className="text-gray-500 max-w-md">Pick an industry above and try a tailored prompt, or describe your process below.</p>
              </div>
            )}

          {messages.map((m: any) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role !== "user" && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              
              <div className={`flex flex-col max-w-[85%] ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`rounded-2xl p-4 ${
                  m.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-tr-sm shadow-md" 
                    : "bg-white border border-gray-100 shadow-sm rounded-tl-sm"
                }`}>
                  {m.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>}
                </div>

                {/* Polished App Generated Card */}
                {m.workflowId && (
                  <div className="mt-4 w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {m.isDraft ? (
                      <div className="p-5 flex flex-col items-center text-center space-y-4">
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl border border-yellow-200 w-full text-left">
                          <div className="flex items-center gap-2 mb-3 justify-center">
                            <AlertTriangle className="w-5 h-5 text-yellow-600" />
                            <h4 className="font-semibold text-center text-lg">Review Draft Before Deploying</h4>
                          </div>
                          
                          {m.ui_schema && (
                            <div className="bg-white rounded-lg p-4 border border-yellow-200 shadow-sm">
                              <h5 className="font-bold text-gray-800 mb-1">{m.appTitle}</h5>
                              <p className="text-xs text-gray-500 mb-4">{m.ui_schema.description || 'No description'}</p>
                              
                                  {m.ui_schema.layout_type === 'grid' && m.ui_schema.columns && (
                                <div className="space-y-4">
                                  <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Entry Mode</span>
                                    {m.ui_schema.entryMode === 'personal' ? (
                                      <span className="bg-teal-50 border border-teal-100 text-teal-700 px-3 py-1.5 rounded-lg text-sm font-medium">👤 Each person fills their own form (name dropdown)</span>
                                    ) : (
                                      <span className="bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">🧾 One form fills all rows</span>
                                    )}
                                  </div>

                                  {(() => {
                                      const hasCellTargets = m.ui_schema.columns.some((c: any) => typeof c !== 'string' && c.targets && Object.keys(c.targets).length > 0);
                                      if (hasCellTargets) {
                                          return (
                                            <div>
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Cell Targets</span>
                                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase">
                                                            <tr>
                                                                <th className="px-3 py-2 font-medium">Row</th>
                                                                {m.ui_schema.columns.map((c: any, i: number) => <th key={i} className="px-3 py-2 font-medium">{typeof c === 'string' ? c : c.label}</th>)}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 bg-white">
                                                            {m.ui_schema.rows?.slice(0, 5).map((r: any, idx: number) => (
                                                                <tr key={idx}>
                                                                    <td className="px-3 py-2 font-medium text-gray-800">{r.label}</td>
                                                                    {m.ui_schema.columns.map((c: any, cidx: number) => {
                                                                        const tKey = r.key || r.id || r.label;
                                                                        const cellTarget = c.targets && c.targets[tKey] ? c.targets[tKey] : (c.target ? c.target : "-");
                                                                        return <td key={cidx} className="px-3 py-2 text-indigo-700 font-semibold">{cellTarget !== "-" ? `🎯 ${cellTarget}` : "-"}</td>
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {m.ui_schema.rows?.length > 5 && <div className="text-xs text-gray-400 mt-1">Showing first 5 rows</div>}
                                            </div>
                                          );
                                      }
                                      return (
                                        <div>
                                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Metrics & Targets</span>
                                          <div className="flex flex-wrap gap-2">
                                            {m.ui_schema.columns.map((c: any, idx: number) => (
                                              <div key={idx} className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                                                <span className="font-medium">{typeof c === 'string' ? c : c.label}</span>
                                                {typeof c !== 'string' && c.target && <span className="bg-indigo-200 text-indigo-800 text-xs px-2 py-0.5 rounded font-bold">🎯 {c.target}</span>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                  })()}
                                  
                                  <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Rows</span>
                                    <div className="flex flex-wrap gap-1">
                                      {m.ui_schema.rows?.slice(0,5).map((r: any, idx: number) => (
                                        <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs flex items-center gap-1">
                                          {r.label}
                                          {r.target && <span className="text-[10px] text-gray-500 font-medium">🎯 {r.target}</span>}
                                        </span>
                                      ))}
                                      {m.ui_schema.rows?.length > 5 && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">+{m.ui_schema.rows.length - 5} more</span>}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {m.ui_schema.layout_type === 'list' && (
                                <div>
                                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Fields</span>
                                  <ul className="text-sm space-y-1">
                                    {m.ui_schema.fields?.map((f: any, idx: number) => (
                                      <li key={idx} className="flex justify-between border-b border-gray-50 pb-1">
                                        <span className="text-gray-700 font-medium">{f.label}</span>
                                        <span className="text-gray-400 text-xs uppercase">{f.type}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 w-full max-w-sm">
                          <Button 
                            className="w-full" 
                            onClick={() => approveDraft(m.id, m.workflowId)}
                            disabled={isLoading}
                          >
                            Approve & Deploy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-green-50/50 border-b border-green-100 p-4 flex items-center gap-3">
                          <div className="bg-green-100 text-green-700 p-2 rounded-full">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-green-900">App Ready for Deployment {m.version > 1 && <span className="ml-2 px-2 py-0.5 bg-green-200 text-green-800 rounded-full text-[10px]">v{m.version}</span>}</h4>
                            <p className="text-xs text-green-700">{m.appTitle}</p>
                          </div>
                        </div>
                        
                        <div className="p-5 flex flex-col md:flex-row gap-6 items-center">
                          <div className="flex-1 space-y-4 w-full">
                            {m.version > 1 && (
                              <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded-lg border border-blue-100 flex items-center gap-2">
                                <span>Changes saved. Old QR codes automatically point to this new version.</span>
                              </div>
                            )}
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-gray-500 uppercase">Staff Link</label>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-xs border truncate select-all">
                                  {typeof window !== 'undefined' ? window.location.origin : ''}/submit/{m.workflowId}
                                </code>
                                <Button size="icon" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/submit/${m.workflowId}`)}>
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              <a href={`/submit/${m.workflowId}`} target="_blank" className={`w-full gap-2 ${buttonVariants({ variant: "default" })}`}>
                                <ExternalLink className="w-4 h-4" /> Open App
                              </a>
                              <a href="/dashboard" className={`w-full gap-2 ${buttonVariants({ variant: "outline" })}`}>
                                Open Dashboard
                              </a>
                            </div>
                          </div>

                          <div className="hidden md:flex flex-col items-center justify-center p-3 border border-dashed rounded-xl bg-gray-50">
                            <QRCodeSVG 
                              value={typeof window !== 'undefined' ? `${window.location.origin}/submit/${m.workflowId}` : ''} 
                              size={100}
                              level="M"
                            />
                            <span className="text-[10px] text-gray-400 mt-2 font-medium flex items-center gap-1">
                              <QrCode className="w-3 h-3" /> Scan to open
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {m.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1 shadow-md">
                  <User size={16} className="text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3 justify-start opacity-70">
               <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Loader2 size={16} className="text-primary animate-spin" />
                </div>
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm p-4 flex items-center gap-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-gray-500 font-medium">Compiling schema & validating targets...</span>
                </div>
            </div>
          )}

          {error && (
            <div className="flex gap-3 justify-center">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2 shadow-sm max-w-md text-center">
                <AlertTriangle size={20} className="shrink-0" />
                <span className="leading-snug">
                  {error.includes("429") || error.includes("timeout") || error.includes("Failed to generate")
                    ? "Hang tight — the architect is rate-limited by the free tier. Wait a few seconds and try again."
                    : `Error: ${error}`}
                </span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
          </div>
        </CardContent>

        <div className="p-4 bg-white border-t shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-10">
          <form onSubmit={(e) => customSubmit(e)} className="flex gap-2 items-end max-w-4xl mx-auto">
            <Textarea
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your process (e.g. 'I need a target tracker for my 3 sales reps...')"
              className="flex-1 min-h-[56px] max-h-[200px] resize-y rounded-xl border-gray-300 focus-visible:ring-primary shadow-sm py-3"
            />
            <Button type="submit" disabled={isLoading || !localInput.trim()} className="h-[56px] w-[56px] rounded-xl shadow-md">
              <Send size={20} className={localInput.trim() && !isLoading ? "ml-1" : ""} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}