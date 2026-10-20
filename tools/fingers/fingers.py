import numpy as np, heapq, sys, json
d=np.load('mesh.npz'); weld=d['weld']; co_all=d['co']; E=weld[d['edges']]
nW=weld.max()+1
co=np.zeros((nW,3)); co[weld]=co_all
PERS=float(sys.argv[1]) if len(sys.argv)>1 else 0.012
res={}
for side in 'LR':
    w=np.zeros(nW); np.maximum.at(w,weld,d['w'+side])
    hs=np.where(w>0.05)[0]; hset=set(hs.tolist())
    adj={i:[] for i in hs}
    for a,b in E:
        if a in hset and b in hset and a!=b:
            L=np.linalg.norm(co[a]-co[b]); adj[a].append((b,L)); adj[b].append((a,L))
    W=d['wrist'+side]; El=d['elbow'+side]; ax=(W-El)/np.linalg.norm(W-El)
    t=(co[hs]-W)@ax
    seeds=hs[t<t.min()+0.012]
    g={i:np.inf for i in hs}; pq=[]
    for s in seeds: g[s]=0; pq.append((0,s))
    heapq.heapify(pq)
    while pq:
        dd,x=heapq.heappop(pq)
        if dd>g[x]: continue
        for y,L in adj[x]:
            if dd+L<g[y]: g[y]=dd+L; heapq.heappush(pq,(dd+L,y))
    # persistence: process high to low
    order=sorted(hs,key=lambda i:-g[i])
    parent={}; peak={}; done=set(); deaths={}
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    for x in order:
        roots={find(y) for y,_ in adj[x] if y in done}
        parent[x]=x; done.add(x)
        if not roots: peak[x]=x; continue
        roots=sorted(roots,key=lambda r:-g[peak[r]])
        top=roots[0]; parent[x]=top
        for r in roots[1:]:
            deaths[peak[r]]=(g[peak[r]]-g[x], g[x], peak[top])   # persistence, saddle level, merged into
            parent[r]=top
    alive=[p for p,(pers,sad,into) in deaths.items() if pers>PERS]
    gmax=max(hs,key=lambda i:g[i])
    alive_info=[(p,deaths[p][0],deaths[p][1]) for p in alive]+[(gmax,np.inf,0.0)]
    print(side,'peaks',len(alive_info),[(round(g[p],3),round(min(per,9),3),round(sad,3)) for p,per,sad in alive_info])
    # region of each surviving peak: flood from peak through vertices with g > saddle, not crossing other peaks' regions
    res[side]={'g':{int(i):float(g[i]) for i in hs},'peaks':[(int(p),float(min(per,9)),float(sad)) for p,per,sad in alive_info],'adj':{int(k):[int(y) for y,_ in v] for k,v in adj.items()},'ax':ax.tolist(),'W':W.tolist()}
json.dump(res,open('fingers.json','w'))
np.save('co_weld.npy',co)
