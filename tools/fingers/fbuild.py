import numpy as np, json, heapq
F=json.load(open('fingers.json')); R=json.load(open('fregions.json')); co=np.load('co_weld.npy')
EXT={'finger':0.018,'thumb':0.04}
JF=[0.0,0.42,0.74,1.0]   # joint fractions along the finger (knuckle, middle, end joint, tip)
BL=0.07
out={}
for side in 'LR':
    f=F[side]; g={int(k):v for k,v in f['g'].items()}; adj={int(k):v for k,v in f['adj'].items()}
    W=np.array(f['W']); ax=np.array(f['ax'])
    lab={int(k):v for k,v in R[side]['lab'].items()}; pk=R[side]['peaks']
    regs={k:[v for v,l in lab.items() if l==k] for k in range(len(pk))}
    t_of=lambda vs: float(np.mean((co[vs]-W)@ax))
    # drop the wrist cable: region closest to the wrist along the hand
    cands=sorted(regs, key=lambda k:t_of(regs[k]))
    cable=cands[0]; fings=[k for k in regs if k!=cable]
    cent={k:co[regs[k]].mean(0) for k in fings}
    # thumb: farthest from the others
    def iso(k): return np.mean([np.linalg.norm(cent[k]-cent[j]) for j in fings if j!=k])
    thumb=max(fings,key=iso); four=[k for k in fings if k!=thumb]
    # order fingers from the thumb side: index, middle, ring, pinky
    four.sort(key=lambda k:np.linalg.norm(cent[k]-cent[thumb]))
    names={thumb:'Thumb',four[0]:'Index',four[1]:'Middle',four[2]:'Ring',four[3]:'Pinky'}
    # grow regions downward to the knuckles (highest g first)
    lim={k:min(g[v] for v in regs[k])-(EXT['thumb'] if k==thumb else EXT['finger']) for k in fings}
    lab2={v:l for v,l in lab.items() if l in fings}
    pq=[(-g[v],v) for v in lab2]; heapq.heapify(pq)
    while pq:
        _,x=heapq.heappop(pq); k=lab2[x]
        for y in adj[x]:
            if y not in lab2 and g[y]>lim[k]: lab2[y]=k; heapq.heappush(pq,(-g[y],y))
    res={'bones':{},'weights':{}}
    for k in fings:
        vs=[v for v,l in lab2.items() if l==k]; gs=np.array([g[v] for v in vs]); P=co[vs]
        g0,g1=gs.min(),gs.max()
        s=(gs-g0)/(g1-g0)
        pts=[]
        for j,fr in enumerate(JF):
            band=np.abs(s-fr)<0.08 if 0<fr<1 else ((s<0.1) if fr==0 else (s>0.9))
            pts.append(P[band].mean(0).tolist())
        res['bones'][names[k]]=pts
        # weights: segment index by s, blending near joints
        for v,si in zip(vs,s):
            wv={}
            for j in range(3):
                a,b=JF[j],JF[j+1]
                lo=max(0,min(1,(si-(a-BL))/(2*BL))) if j>0 else max(0,min(1,(si+BL*0.2)/(2*BL)))  # ramp in
                hi=max(0,min(1,((b+BL)-si)/(2*BL))) if j<2 else 1
                wv[j]=min(lo,hi)
            tot=sum(wv.values()); 
            hand=max(0,1-tot)
            res['weights'][int(v)]={'f':names[k],'w':[wv[0],wv[1],wv[2]],'hand':hand}
        print(side,names[k],'verts',len(vs),'len',round(float(np.linalg.norm(np.array(pts[-1])-np.array(pts[0]))),3))
    out[side]=res
json.dump(out,open('fbuild.json','w'))
