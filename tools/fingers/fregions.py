import numpy as np, json
from PIL import Image, ImageDraw
F=json.load(open('fingers.json')); co=np.load('co_weld.npy')
COL=[(230,30,30),(30,160,30),(30,60,230),(200,0,200),(230,150,0),(0,180,200)]
out={}
for side in 'LR':
    f=F[side]; g={int(k):v for k,v in f['g'].items()}; adj={int(k):v for k,v in f['adj'].items()}
    peaks=[p for p in f['peaks'] if p[1]>0.03]
    # flood each peak region above its saddle (minus a little), lowest saddle last so fingers win ties
    lab={}
    for k,(p,per,sad) in enumerate(sorted(peaks,key=lambda q:-q[2])):
        lim=sad-0.004 if per<9 else max(q[2] for q in peaks if q[1]<9)-0.004
        st=[p]; 
        if p in lab: continue
        lab[p]=k
        while st:
            x=st.pop()
            for y in adj[x]:
                if y not in lab and g[y]>lim and g[y]<=g[x]+0.004: lab[y]=k; st.append(y)
    pk=sorted(peaks,key=lambda q:-q[2])
    print(side,[(k,round(g[p],3),round(sad,3),sum(1 for v in lab.values() if v==k)) for k,(p,per,sad) in enumerate(pk)])
    hs=np.array(list(g.keys())); W=np.array(f['W']); ax=np.array(f['ax'])
    rel=co[hs]-W; t=rel@ax; perp=rel-np.outer(t,ax); u,s,vt=np.linalg.svd(perp-perp.mean(0),full_matrices=False); l=vt[0]; n=np.cross(ax,l)
    img=Image.new('RGB',(1000,420),'white'); dr=ImageDraw.Draw(img)
    for i,vi in enumerate(hs):
        c=COL[lab[vi]%6] if vi in lab else (190,190,190)
        y=20+(t[i]+0.08)*1500
        for cx,xv in ((250,rel[i]@l),(750,rel[i]@n)): dr.rectangle((cx+xv*1500,y,cx+xv*1500+2,y+2),fill=c)
    img.save(f'freg_{side}.png')
    out[side]={'lab':{int(k):v for k,v in lab.items()},'peaks':pk}
json.dump(out,open('fregions.json','w'))
