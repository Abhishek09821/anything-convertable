from app.services.ai_edit import apply_command
from app.services.reconstruct import score

def test_edit_amount():
    d={'pages':[{'elements':[{'id':'1','type':'text','bounds':{'x':0,'y':0,'width':100,'height':20},'text':'₹10,000','style':{'fontWeight':400}}]}]}
    out=apply_command(d,'Change ₹10,000 to ₹15,000')
    assert out['pages'][0]['elements'][0]['text']=='₹15,000'

def test_score():
    d={'pages':[{'elements':[{'id':'1','type':'text','confidence':.9}]}]}
    assert score(d)['overall']>0
