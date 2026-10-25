// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract BridgeOutVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 6850672842308916986105410488821352066638677747097748145135094599375973632246;
    uint256 constant alphay  = 370148193142326107827201949645637909232886536619918860125636212543592679951;
    uint256 constant betax1  = 8254278108179544962756589744606913497334349001100885333417588579733006744376;
    uint256 constant betax2  = 10099504256433829997202782098312242352929437761633160144432996502454498933816;
    uint256 constant betay1  = 9792975563309901685719450051812847966367010244173883003449456786209623381037;
    uint256 constant betay2  = 11365707550338422941266710008456891925212715612630822521660870965534617725010;
    uint256 constant gammax1 = 4420528637576828175327152976308435744835649916271220502144682862911423027141;
    uint256 constant gammax2 = 3938827492888245931312525313942249944340425469752763689368882052056502202029;
    uint256 constant gammay1 = 8825106305143512247617078617101043265538861124838794203105304936437577053595;
    uint256 constant gammay2 = 14022071342093410325778040325283226171262454358670963812064634797330816740200;
    uint256 constant deltax1 = 9743951138822154986613964600669284719872111515679160522331904460615263334313;
    uint256 constant deltax2 = 10614576289200585086000805734974834537662413437816165045899090890522812964682;
    uint256 constant deltay1 = 3969044941208312943574564548997410062835344034653966162132705047365988952217;
    uint256 constant deltay2 = 7489082447157767681511512446745237678507337786687355559167702909846174715695;

    
    uint256 constant IC0x = 2053938680256847031173084944431988129151948962661724309560687183424878326904;
    uint256 constant IC0y = 491028803227232206344695624780464256143740537551539430346894787412674946674;
    
    uint256 constant IC1x = 11046073127767512823417820217318042413690882600276257980045648871265088857341;
    uint256 constant IC1y = 495697675405772829509734902358009237144000383875799132489433453072916786278;
    
    uint256 constant IC2x = 5462949332363866388026456458700942154829065315160544158147703359384174761039;
    uint256 constant IC2y = 10612346933308773180509535105032078327274795583182684839607699362671560290739;
    
    uint256 constant IC3x = 5935258450566381603584355386994404838545233251164882196160024784184136504344;
    uint256 constant IC3y = 16260303328066290958333076944864053634135169434992851971576371809984574563660;
    
    uint256 constant IC4x = 537489388885348169245942988393715925188928742809874287626804333437733636926;
    uint256 constant IC4y = 6930897839138223449743076264430065556326488580511176332206049366505167095071;
    
    uint256 constant IC5x = 1755963464754480758345352882816514417738904279355578307407073564687568126751;
    uint256 constant IC5y = 8712292944454777122950407886499143173252506140233203273110544932446541662259;
    
    uint256 constant IC6x = 13569168648811325875875227482199543889426444289585480893544177875159153639725;
    uint256 constant IC6y = 4634824752897715735515727860204014911248754875743913033608242777913673189257;
    
    uint256 constant IC7x = 19422416371725003093292909287019412829948743020974837587570461911299239234095;
    uint256 constant IC7y = 5374065662475434122083674175846707078709107163258721550539850342855496312681;
    
    uint256 constant IC8x = 20990288480718829658559471113720121356680899486138662735993235056482403308971;
    uint256 constant IC8y = 5617049070134244378809474838306793713136800771988583415329875637133242038206;
    
    uint256 constant IC9x = 11775833679350299776820231042563326566790273487065658607886262741053811664657;
    uint256 constant IC9y = 7540041143541824051559903813532487169943582131805133789010461422205376110120;
    
    uint256 constant IC10x = 3652837107359821146303115245101244746918180116268610180104319587292107065733;
    uint256 constant IC10y = 641128440623280037903173324714541301523598770861369276790000192916010482515;
    
    uint256 constant IC11x = 4467126704991806866931850089251251733027229859652858285764415854753195146133;
    uint256 constant IC11y = 20282409937604135923568528247698790158073750740580128174591884753656817756729;
    
    uint256 constant IC12x = 11590601238982455196545411883571434556263903259654861085111306182037475354674;
    uint256 constant IC12y = 7679566882462343616050247001313606389402829167260767617489505348536158259823;
    
    uint256 constant IC13x = 12897973016338102506928790923253726569257710787068953738768869822150197838872;
    uint256 constant IC13y = 1278535832415449448618333161339091875508241926509359960109409684871517305307;
    
    uint256 constant IC14x = 10415007483827295301511681139105142451014187879245637550850996657728865058338;
    uint256 constant IC14y = 5038656664928972904055547785970650046299846506220456041708252994809392241206;
    
    uint256 constant IC15x = 12605635608496127519094891177453513354415443994400531909700268662449580834063;
    uint256 constant IC15y = 14928253904161713926115805656515711372110337930753761642202037715659302990598;
    
    uint256 constant IC16x = 19096275044455808232192941028953850721577976280614193520438417171990542721863;
    uint256 constant IC16y = 21109840097630964749790497178707342381599982090455004624213998810878554657217;
    
    uint256 constant IC17x = 14680765236383889899446508033839517424595094433135686896233827369810007648376;
    uint256 constant IC17y = 785164557639567005383151148796423750140932444972416808364974372441571550092;
    
    uint256 constant IC18x = 13277444370464141392630220707238509430488832811597239352914876802775310614956;
    uint256 constant IC18y = 8700442641105575614550547998009304947719423191776598171491579352586546906347;
    
    uint256 constant IC19x = 11186714707194658723260722720414599043611878703503001434788270800207162057360;
    uint256 constant IC19y = 14143991989466086071587135302472108710722813886373761010284888213338340486921;
    
    uint256 constant IC20x = 9371567337032226482450724160781686639084611555839366873698669621335007761545;
    uint256 constant IC20y = 1568725403521979382311841850746538230855580229919781962707207286493224574864;
    
    uint256 constant IC21x = 6646704385344313790091937496195921663285737720274526292187407784722769758685;
    uint256 constant IC21y = 3162462734248601927793371593600420040150710324623995241239998381257898699504;
    
    uint256 constant IC22x = 16600215447674773860109107603587961153595511235680465630335231018909658227748;
    uint256 constant IC22y = 17651186165283947490476789711809074492093364041857947250524914161555150213560;
    
    uint256 constant IC23x = 21213250106542455300608927136767199445341614624767753788863402126162161131261;
    uint256 constant IC23y = 5717070707381408566032190556731959030757322884132667096283735163642129346801;
    
    uint256 constant IC24x = 11670912182592443380654141617324780703032473011528364309667166429997863521301;
    uint256 constant IC24y = 15082510333927251886859744371409487901550186903993964633856146364477583115299;
    
    uint256 constant IC25x = 3667150709042486201438030254833669992338698267594224650006483238268469640285;
    uint256 constant IC25y = 17495008262304815094679978843315853241959659791055147395291020053765927170899;
    
    uint256 constant IC26x = 14146287046467109291930454554467301561336972111026827606010478843773834598074;
    uint256 constant IC26y = 14226652812819133460420744930999737880382436690695798446092613611120826579449;
    
    uint256 constant IC27x = 18311741089323414586249597357212408867993833649620825265183681689200925941063;
    uint256 constant IC27y = 17570614567605620409364980481589797924831840675592520509523620470290457333690;
    
    uint256 constant IC28x = 15189551428407421995769906882497372621303861096563121891122561419768376234517;
    uint256 constant IC28y = 7627624215009382301718604174320251300581751643092722395117465846760669295140;
    
    uint256 constant IC29x = 6906222722489233976094546275618220605135283416792909085402827069780019661997;
    uint256 constant IC29y = 21671258176339653806990186059541196583939678385239698322393320048943177913048;
    
    uint256 constant IC30x = 4188305852934520508187604571604626813658633173530993194116528836766137146603;
    uint256 constant IC30y = 19568829135395042361264816162722595421509277804016952545030199125989115366714;
    
    uint256 constant IC31x = 15177988245531918611149792969860150205504652623796856084517885555653234576438;
    uint256 constant IC31y = 20038756822662848387221197117889687395137033832210398307909000303781408499189;
    
    uint256 constant IC32x = 15523203222407854500418523135208229344914730373964258640028532910647567939023;
    uint256 constant IC32y = 14620151781240567862839700920358254854173015567066428079108918719506527146984;
    
    uint256 constant IC33x = 18398569106350684624128237322704324120349108464764651627852249679549298341582;
    uint256 constant IC33y = 9777863638677332665496113842623046694131307224053822139375705425720005273676;
    
    uint256 constant IC34x = 21327720026449793686550709270964706439862172828039837363002531422185290925924;
    uint256 constant IC34y = 9706288017613043862875634411733837402356122387746232851920726951162253034704;
    
    uint256 constant IC35x = 20225730610722117686152076830675199141325239797830756219116289281445120944373;
    uint256 constant IC35y = 15729448315988613113022919283396737275775901930424169411456008941011642233002;
    
    uint256 constant IC36x = 3210165884458911564695304494558266449537028712815254475215869496249309251048;
    uint256 constant IC36y = 17346565402058993322836650125488152511164416922304105589091337620537908195172;
    
    uint256 constant IC37x = 15825282753155590562793539680857847321879014350583704010514151332688739139424;
    uint256 constant IC37y = 18742452920725799649395692014736826093103433149119499654058206144386582723464;
    
    uint256 constant IC38x = 586132557467535586042305537489518296479506435864008986062796175335508013823;
    uint256 constant IC38y = 17126495750662453085278613831451919744138067449071977485231505822814487482680;
    
    uint256 constant IC39x = 9881041422774049896666901338901816482335250391728095987261853136783830962494;
    uint256 constant IC39y = 18974808187481477335849300749843797151862554744794249167696057934858265120737;
    
    uint256 constant IC40x = 7470531874142350278167312236991715337851643037644681164025465082500836292077;
    uint256 constant IC40y = 17812394821899013501242095853821165436197766454680968403859982859358841682010;
    
    uint256 constant IC41x = 16507024296442862513325509543173242251233871934220238516197977237115693536669;
    uint256 constant IC41y = 21815254986868090372118849221730818449112112217499238076541920557070675803092;
    
    uint256 constant IC42x = 20155937503770305854166534985677980908481317015646518295268224196523143678708;
    uint256 constant IC42y = 21559293925996146704196186894689159271511980221581413587209757501877110813371;
    
    uint256 constant IC43x = 5704591489302337339193012278714066549339203175581452889771294793587676118396;
    uint256 constant IC43y = 21673642444601515822528231891526218123615535247741527466976389077113562333417;
    
    uint256 constant IC44x = 4281160301429691112011077600313932086914178898637910215967070152476782501000;
    uint256 constant IC44y = 18093846496704912595134989757969653185403575475558449932965391175360701321858;
    
    uint256 constant IC45x = 14998487806598308755666378300134903002005772964352454504980505465488189754682;
    uint256 constant IC45y = 3559478419786429431133250821825973037263810489477190414462497248473959871981;
    
    uint256 constant IC46x = 21504596076020037683923348587047719132269002888012006268227616187746033711376;
    uint256 constant IC46y = 5112619274041749941315893077768305203002930932374264235070076026079321796499;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[46] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                
                g1_mulAccC(_pVk, IC42x, IC42y, calldataload(add(pubSignals, 1312)))
                
                g1_mulAccC(_pVk, IC43x, IC43y, calldataload(add(pubSignals, 1344)))
                
                g1_mulAccC(_pVk, IC44x, IC44y, calldataload(add(pubSignals, 1376)))
                
                g1_mulAccC(_pVk, IC45x, IC45y, calldataload(add(pubSignals, 1408)))
                
                g1_mulAccC(_pVk, IC46x, IC46y, calldataload(add(pubSignals, 1440)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            
            checkField(calldataload(add(_pubSignals, 1312)))
            
            checkField(calldataload(add(_pubSignals, 1344)))
            
            checkField(calldataload(add(_pubSignals, 1376)))
            
            checkField(calldataload(add(_pubSignals, 1408)))
            
            checkField(calldataload(add(_pubSignals, 1440)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
