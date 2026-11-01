import { Link } from 'react-router-dom';
import Art from '../components/Art';
import Strip from '../components/Strip';
import { ART } from '../lib/art';
import { useSite } from '../lib/site-context';

export default function Rules() {
  const { state } = useSite();
  const { claimWindowDays } = state;

  return (
    <>
      <header className="shell page-head">
        <div className="page-head-main">
          <h1 className="page-title display">你怎么拿到这笔钱</h1>
        </div>
        <Art piece={ART.scale} ratio="4 / 3" />
      </header>

      <div className="shell rules-wrap">
        <ol className="rules-list">
          <li className="rule-item" data-reveal>
            周期性的约定，在<Link to="/records">记录页</Link>上找<strong>红色格子</strong>，
            那是我没有记录的周期，点一下就能复制索赔话术。
            我拿不出证明，立刻转账。
          </li>
          <li className="rule-item" data-reveal>
            <strong>随时生效的约定</strong>——抱怨工作、吃糖、讨好、提原生家庭——
            我没法自证，<strong>由你们随时监督</strong>。当场抓到就算，我立刻转账。
          </li>
          <li className="rule-item" data-reveal>
            一次违约事件<strong>只付给第一个发现的人</strong>。
          </li>
          <li className="rule-item" data-reveal>
            你不需要天天盯着。随便哪天想点杯奶茶了，上来翻一翻，
            <strong>滚动 {claimWindowDays} 天内</strong>的违约事件都还作数。
          </li>
          <li className="rule-item" data-reveal>
            生病、节假日等确实做不到的日子，我可以申请豁免赔付——<strong>不赔钱，但仍然算失约、计入守约率。</strong>
          </li>
        </ol>
      </div>

      <Strip pieces={[ART.watch, ART.hourglass, ART.purse]} label="账本里的旧物" />
    </>
  );
}
