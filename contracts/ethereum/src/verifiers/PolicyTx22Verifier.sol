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

contract PolicyTx22Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 6061830440024697555389831871361826269609742940952195699725332007406532998488;
    uint256 constant alphay  = 1486848905372738922835208229693412067547053029983295026705727039628354390338;
    uint256 constant betax1  = 9828580856242868169775736911437788704037156898247804774898394414082330463154;
    uint256 constant betax2  = 19738539696514864449220370034154504541748180517712412011771207389641673176488;
    uint256 constant betay1  = 15438284331600184898653565705914928137988683435959827944496461773205775492341;
    uint256 constant betay2  = 19419015982817447532252597475196633848377950948599551721681453658879841873102;
    uint256 constant gammax1 = 13521810331309876479346486670996708792455729707996517985786613438165521918969;
    uint256 constant gammax2 = 7992259385725214216865056792843966824068659693868363659837478486216535690973;
    uint256 constant gammay1 = 19631354784641168076243303318821341833679803785006740201027709618504958141981;
    uint256 constant gammay2 = 14792275874631425578974139539917110882372210486605889409327451274618102621651;
    uint256 constant deltax1 = 18204163059961001544249405923016679497838843414350145533607533620760894679364;
    uint256 constant deltax2 = 16774532744413619475526146400372800483242022988429524230084825077669241519752;
    uint256 constant deltay1 = 11690602860405629777248666627662178093007966473510210074876902735656290760785;
    uint256 constant deltay2 = 4438925539481887551012407661147823798414845403296850900865196030929958961933;

    
    uint256 constant IC0x = 9126113363229039867342396769888956119365792929062200432930857029658999172593;
    uint256 constant IC0y = 76128852635115891661920696115790968025069923597419860621319450394942728803;
    
    uint256 constant IC1x = 12163926616381259282699005895828513078061561374100173132708797268063494059660;
    uint256 constant IC1y = 10065237905435625439699279377421189731010845759466661650660775801323080092043;
    
    uint256 constant IC2x = 18221415012912725629329365788639542564295870285868696854188299133424407177210;
    uint256 constant IC2y = 4373131982309279615543101723728371176776862599334358842353112058696020576487;
    
    uint256 constant IC3x = 13072825956630428693886479550844077475525687221473258408355850774447140505793;
    uint256 constant IC3y = 2700903211537179771539617638287800364913593986387213963890467441819381415030;
    
    uint256 constant IC4x = 16980313273755220183327024697331474356280690796703949198680170255466477145263;
    uint256 constant IC4y = 11810061383974897238251083991964933978812721232592476370341956031490622435751;
    
    uint256 constant IC5x = 21093931614469140146921221205199444555811951011727315079058265326605388846075;
    uint256 constant IC5y = 19739361836425559117113740554462890174526191360263403479492252271444643663252;
    
    uint256 constant IC6x = 7853422541747988755693217347389885975277877756764431229854062304083550165844;
    uint256 constant IC6y = 13724950491219463318399391598645515421902024959550708126562144529834110814954;
    
    uint256 constant IC7x = 11805984441151792756639576987160151517428998204341976234704507484565860706813;
    uint256 constant IC7y = 11052808492518765783306427974297402957573779638900704001011145600340606686564;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[7] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
